const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) =>
      `${level}: ${message} {"timestamp":"${timestamp}"}`
    )
  ),
  transports: [new winston.transports.Console()],
});
module.exports = logger;
