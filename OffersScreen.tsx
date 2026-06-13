{
  "name": "link-backend",
  "version": "1.0.0",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "dotenv": "^16.4.5",
    "firebase-admin": "^12.3.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "joi": "^17.13.1",
    "axios": "^1.7.2",
    "node-cron": "^3.0.3",
    "morgan": "^1.10.0",
    "winston": "^3.13.0",
    "express-rate-limit": "^7.3.1",
    "multer": "^1.4.5-lts.1",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.4"
  }
}
