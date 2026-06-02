const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ level, message, timestamp }) => `${level}: ${message} {"timestamp":"${timestamp}"}`)
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
