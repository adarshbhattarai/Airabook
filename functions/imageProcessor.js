const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const path = require("path");
const os = require("os");
const fs = require("fs");
const BusBoy = require("busboy");

// Make sure Admin SDK is initialized (safe even if done elsewhere)
if (!admin.apps.length) {
  admin.initializeApp();
}

const ALLOWED_MIME_PREFIXES = ["image/", "video/"];

/**
 * Handles Busboy events for streaming file uploads to Cloud Storage
 * and writing their signed URLs to Firestore.
 *
 * @param {BusBoy} busboy
 * @param {string} uid - Firebase Auth user ID
 * @param {import("express").Response} res
 */
function handleBusboyEvents(busboy, uid, res) {
  const tmpdir = os.tmpdir();
  const writePromises = [];
  const uploads = {};

  // Handle each incoming file
  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) =>
      mimetype.startsWith(prefix)
    );

    if (!isAllowed) {
      console.warn(`Rejected file "${filename}" with type "${mimetype}"`);
      file.resume(); // drain the stream
      res.status(400).send("Invalid file type. Only images and videos are allowed.");
      return;
    }

    const filepath = path.join(tmpdir, filename);
    const writeStream = fs.createWriteStream(filepath);
    file.pipe(writeStream);

    const writePromise = new Promise((resolve, reject) => {
      file.on("end", () => {
        writeStream.end();
      });

      writeStream.on("finish", () => {
        uploads[filename] = { filepath, mimetype };
        resolve();
      });

      writeStream.on("error", reject);
    });

    writePromises.push(writePromise);
  });

  // When all files have been read
  busboy.on("finish", async () => {
    try {
      await Promise.all(writePromises);

      const bucket = admin.storage().bucket();
      const uploadTasks = Object.entries(uploads).map(
        async ([filename, { filepath, mimetype }]) => {
          // Upload to Storage
          const [file] = await bucket.upload(filepath, {
            destination: `media/${uid}/${filename}`,
            metadata: { contentType: mimetype },
          });

          // Make signed URL
          const [publicUrl] = await file.getSignedUrl({
            action: "read",
            expires: "03-09-2491",
          });

          // Save URL record in Firestore
          const db = admin.firestore();
          return db
            .collection("mediaUrls")
            .add({
              url: publicUrl,
              userId: uid,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
      );

      await Promise.all(uploadTasks);
      res.status(200).send("Files uploaded successfully.");
    } catch (error) {
      console.error("Error uploading files:", error);
      res.status(500).send("Error uploading files.");
    }
  });
}

exports.uploadMedia = onRequest(async (req, res) => {
  console.log("uploadMedia function triggered");

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const authHeader = req.headers.authorization || "";
  const hasBearer = authHeader.startsWith("Bearer ");

  if (!hasBearer) {
    return res.status(401).send("Unauthorized");
  }

  const idToken = authHeader.split("Bearer ")[1];

  let uid;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (error) {
    console.error("Error while verifying Firebase ID token:", error);
    return res.status(403).send("Unauthorized");
  }

  const busboy = new BusBoy({ headers: req.headers });
  handleBusboyEvents(busboy, uid, res);
  busboy.end(req.rawBody);
});

// Export helper for tests
if (process.env.NODE_ENV === "test") {
  exports.handleBusboyEvents = handleBusboyEvents;
}
