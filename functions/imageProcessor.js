const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const path = require("path");
const os = require("os");
const fs = require("fs");
const BusBoy = require("busboy");

function handleBusboyEvents(busboy, uid, res) {
    const tmpdir = os.tmpdir();
    const filePaths = [];
    const uploads = {};

    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
        if (mimetype.startsWith("image/") || mimetype.startsWith("video/")) {
            const filepath = path.join(tmpdir, filename);
            const writeStream = fs.createWriteStream(filepath);
            file.pipe(writeStream);

            const promise = new Promise((resolve, reject) => {
                file.on("end", () => {
                    writeStream.end();
                });
                writeStream.on("finish", () => {
                    uploads[filename] = {
                        filepath,
                        mimetype,
                    };
                    resolve();
                });
                writeStream.on("error", reject);
            });

            filePaths.push(promise);
        } else {
            res.status(400).send("Invalid file type. " +
                "Only images and videos are allowed.");
        }
    });

    busboy.on("finish", async () => {
        await Promise.all(filePaths);

        const bucket = admin.storage().bucket();
        const uploadPromises = [];

        for (const filename in uploads) {
            if (Object.prototype.hasOwnProperty.call(uploads, filename)) {
                const { filepath, mimetype } = uploads[filename];
                const uploadPromise = bucket.upload(filepath, {
                    destination: `media/${uid}/${filename}`,
                    metadata: {
                        contentType: mimetype,
                    },
                }).then(async (uploadResponse) => {
                    const file = uploadResponse[0];
                    const publicUrl = await file
                        .getSignedUrl({
                            action: "read",
                            expires: "03-09-2491",
                        })
                        .then((urls) => urls[0]);

                    return admin.firestore().collection("mediaUrls").add({
                        url: publicUrl,
                        userId: uid,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                });
                uploadPromises.push(uploadPromise);
            }
        }

        try {
            await Promise.all(uploadPromises);
            res.status(200).send("Files uploaded successfully.");
        } catch (error) {
            console.error(error);
            res.status(500).send("Error uploading files.");
        }
    });
}

exports.uploadMedia = onRequest(async (request, response) => {
  console.log("uploadMedia function triggered");
  if (request.method !== "POST") {
    return response.status(405).end();
  }

  if (
    !request.headers.authorization ||
    !request.headers.authorization.startsWith("Bearer ")
  ) {
    return response.status(401).send("Unauthorized");
  }

  const idToken = request.headers.authorization.split("Bearer ")[1];
  let uid;

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (error) {
    console.error("Error while verifying Firebase ID token:", error);
    return response.status(403).send("Unauthorized");
  }

  const busboy = new BusBoy({headers: request.headers});
  handleBusboyEvents(busboy, uid, response);
  busboy.end(request.rawBody);
});

if (process.env.NODE_ENV === 'test') {
    exports.handleBusboyEvents = handleBusboyEvents;
}
