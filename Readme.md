# Backend Setup Guide

## Prerequisites

- Node.js (Latest LTS version recommended)
- PostgreSQL Database
- Firebase Admin SDK (for authentication)
- Google Cloud API credentials 

## Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/your-repo.git
   cd your-repo/backend
   ```
2. Install dependencies:
   ```sh
   npm install
   ```

## Environment Variables

Create a `.env` file in the root directory and add the following variables:

```env
# Server Configuration
PORT=5000

# Database Configuration
DATABASE_URL=postgres://your_username:your_password@your_host:your_port/your_database

#Google Drive Api
GOOGLE_DRIVE_REDIRECT_URI="Authorized redirect url"
GOOGLE_DRIVE_CLIENT_SECRET="client secret"
GOOGLE_DRIVE_CLIENT_ID="client id"
GOOGLE_DRIVE_ROOT_FOLDER="your folder name"

#Firebase Admin File
GOOGLE_APPLICATION_CREDENTIALS="firebase admin file credentials"

#Google service account json file
GOOGLE_SERVICE_ACCOUNT_PATH="service account file"

## Running the Server

To start the server in development mode:

```sh
npm run dev
```

For production:

```sh
npm run dev
```

## API Documentation

- Base URL: `http://localhost:5000/`
- Authentication: `POST /api/auth/login`, `POST /api/auth/signup`
- Users: `GET /api/users`, `GET /api/users/:id`

## Security Best Practices

- **DO NOT** commit the `.env` file to version control.
- Use a `.gitignore` file to exclude `.env`.
- Store sensitive credentials in environment variables when deploying to production.

## Deployment

For deployment, ensure you configure environment variables on the hosting provider (e.g., Heroku, AWS, Vercel, or DigitalOcean) instead of hardcoding them in the codebase.

## License

This project is licensed under the MIT License.
