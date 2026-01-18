const setSseHeaders = (res) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(':ready\n\n');
};

const sendEvent = (res, event, payload) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const attachCloseHandler = (req) => {
  let isClosed = false;
  req.on('close', () => {
    isClosed = true;
  });
  return () => isClosed;
};

module.exports = {
  setSseHeaders,
  sendEvent,
  attachCloseHandler,
};
