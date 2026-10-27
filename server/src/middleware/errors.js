// Final error handler. Keeps messages friendly and never leaks stack traces to clients.
function notFound(req, res) {
  res.status(404).json({ message: `No route for ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res) {
  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({ message: first ? first.message : 'Invalid data.' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'That already exists.' });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'One of the ids in the link is invalid.' });
  }
  if (err.status && err.expose) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: 'Something went wrong on our side. Try again.' });
}

module.exports = { notFound, errorHandler };
