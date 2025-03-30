export const errorHandler = (err, req, res, next) => {
   // Log the error for debugging purposes
   log.error(err, 'Error caught by middleware')

   // Default error handler
   const statusCode = err.statusCode || 500
   const message = err.message || 'Internal server error'

   res.status(statusCode).json({
      error: statusCode === 500 ? 'Internal server error' : message,
      // Only include stack trace in development
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
   })
}