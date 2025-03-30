const asyncHandler = require('express-async-handler');
const admin = require('firebase-admin');
const db = require('../db');
const { google } = require('googleapis');
const path = require('path');
const { Buffer } = require('buffer');

// Function to decode base64 string
const decodeBase64 = (base64String) => {
  return Buffer.from(base64String, 'base64').toString('utf-8');
};

// Decode the base64 strings from the environment variables
const GOOGLE_SERVICE_ACCOUNT_PATH = decodeBase64(process.env.GOOGLE_SERVICE_ACCOUNT_PATH);
const GOOGLE_APPLICATION_CREDENTIALS = decodeBase64(process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Debugging: Log the decoded strings
console.log('Decoded GOOGLE_SERVICE_ACCOUNT_PATH:', GOOGLE_SERVICE_ACCOUNT_PATH);
console.log('Decoded GOOGLE_APPLICATION_CREDENTIALS:', GOOGLE_APPLICATION_CREDENTIALS);

// Validate the JSON structure of GOOGLE_APPLICATION_CREDENTIALS
let firebaseCredentials;
try {
  firebaseCredentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
  console.log('Firebase credentials parsed successfully:', firebaseCredentials);
} catch (error) {
  console.error('Error parsing Firebase credentials:', error);
  throw new Error('Invalid Firebase credentials JSON');
}

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(firebaseCredentials),
  databaseURL: 'https://your-database-name.firebaseio.com'
});

// Configure Google Drive API
const setupGoogleDrive = async (userEmail) => {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_PATH), // Use credentials directly
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // Check if root folder exists or create it
    const rootFolderName = process.env.GOOGLE_DRIVE_ROOT_FOLDER || 'Draft-Keeper';
    let folderId;

    // Search for existing folder
    const folderResponse = await drive.files.list({
      q: `name='${rootFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (folderResponse.data.files.length > 0) {
      // Folder exists
      folderId = folderResponse.data.files[0].id;
      console.log(`Root folder ID: ${folderId}`);
    } else {
      // Create new folder
      const folderMetadata = {
        name: rootFolderName,
        mimeType: 'application/vnd.google-apps.folder',
      };

      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id'
      });

      folderId = folder.data.id;
      console.log(`Created root folder with ID: ${folderId}`);
    }

    // Create user-specific subfolder
    const userFolderName = userEmail.replace('@', '_at_');
    const userFolderResponse = await drive.files.list({
      q: `name='${userFolderName}' and mimeType='application/vnd.google-apps.folder' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    let userFolderId;
    if (userFolderResponse.data.files.length > 0) {
      // User folder exists
      userFolderId = userFolderResponse.data.files[0].id;
      console.log(`User folder ID: ${userFolderId}`);
    } else {
      // Create user folder
      const userFolderMetadata = {
        name: userFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [folderId]
      };

      const userFolder = await drive.files.create({
        resource: userFolderMetadata,
        fields: 'id'
      });

      userFolderId = userFolder.data.id;
      console.log(`Created user folder with ID: ${userFolderId}`);
    }

    return { drive, folderId: userFolderId };
  } catch (error) {
    console.error('Error setting up Google Drive:', error);
    throw new Error('Failed to setup Google Drive connection');
  }
};


// Get all drafts for the current user
const getDrafts = asyncHandler(async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.id, d.title, d.content, d.saved_to_cloud AS "savedToCloud",
              d.google_file_id AS "googleFileId",
              d.created_at AS "createdAt", d.updated_at AS "updatedAt",
              u.id AS "userId"
       FROM drafts d
       JOIN users u ON d.user_id = u.id
       WHERE u.id = $1
       ORDER BY d.updated_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting drafts:', error);
    res.status(500);
    throw new Error('Failed to retrieve drafts');
  }
});

const getDraft = asyncHandler(async (req, res) => {
  const draftId = Number(req.params.id); // Use Number() instead of parseInt()

  if (!Number.isInteger(draftId)) {
    console.error(`Invalid draft ID received: ${req.params.id}`);
    return res.status(400).json({ message: 'Invalid draft ID' });
  }

  console.log(`Fetching draft ID: ${draftId}`);

  try {
    const result = await db.query(
      `SELECT d.id, d.title, d.content, d.saved_to_cloud AS "savedToCloud",
              d.google_file_id AS "googleFileId",
              d.created_at AS "createdAt", d.updated_at AS "updatedAt",
              u.id AS "userId"
       FROM drafts d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = $1 AND u.id = $2`,
      [draftId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Draft not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting draft:', error);
    return res.status(500).json({ message: 'Failed to retrieve draft' });
  }
});

// Create a new draft
const createDraft = asyncHandler(async (req, res) => {
  const { title, content } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO drafts (user_id, title, content)
       VALUES ($1, $2, $3)
       RETURNING id, title, content, saved_to_cloud AS "savedToCloud",
                google_file_id AS "googleFileId",
                created_at AS "createdAt", updated_at AS "updatedAt"`,
      [req.user.id, title || 'Untitled Draft', content || '']
    );

    const draft = result.rows[0];
    draft.userId = req.user.id;

    res.status(201).json(draft);
  } catch (error) {
    console.error('Error creating draft:', error);
    res.status(500);
    throw new Error('Failed to create draft');
  }
});

// Update an existing draft
const updateDraft = asyncHandler(async (req, res) => {
  const { title, content } = req.body;
  const draftId = parseInt(req.params.id, 10); // Parse the draftId as an integer
  if (isNaN(draftId)) {
    res.status(400);
    throw new Error('Invalid draft ID');
  }

  try {
    // First check if the draft exists and belongs to the user
    const checkResult = await db.query(
      `SELECT d.id
       FROM drafts d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = $1 AND u.id = $2`,
      [draftId, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      res.status(404);
      throw new Error('Draft not found or unauthorized');
    }

    // Prepare update fields
    const updateFields = [];
    const values = [];
    let queryIndex = 1;

    if (title !== undefined) {
      updateFields.push(`title = $${queryIndex}`);
      values.push(title);
      queryIndex++;
    }

    if (content !== undefined) {
      updateFields.push(`content = $${queryIndex}`);
      values.push(content);
      queryIndex++;
    }

    // Always update the updated_at timestamp
    updateFields.push(`updated_at = NOW()`);

    // Add the required parameters
    values.push(draftId, req.user.id);

    // If there are no fields to update, just return the current draft
    if (updateFields.length === 1) { // Only updated_at
      const currentDraft = await db.query(
        `SELECT d.id, d.title, d.content, d.saved_to_cloud AS "savedToCloud",
                d.google_file_id AS "googleFileId",
                d.created_at AS "createdAt", d.updated_at AS "updatedAt",
                u.id AS "userId"
         FROM drafts d
         JOIN users u ON d.user_id = u.id
         WHERE d.id = $1 AND u.id = $2`,
        [draftId, req.user.id]
      );
      return res.json(currentDraft.rows[0]);
    }

    // Perform the update
    const result = await db.query(
      `UPDATE drafts
       SET ${updateFields.join(', ')}
       WHERE id = $${queryIndex} AND user_id = (
         SELECT id FROM users WHERE id = $${queryIndex + 1}
       )
       RETURNING id, title, content, saved_to_cloud AS "savedToCloud",
                google_file_id AS "googleFileId",
                created_at AS "createdAt", updated_at AS "updatedAt"`,
      values
    );

    const updatedDraft = result.rows[0];
    updatedDraft.userId = req.user.id;

    res.json(updatedDraft);
  } catch (error) {
    console.error('Error updating draft:', error);
    if (error.message === 'Draft not found or unauthorized' || error.message === 'Invalid draft ID') {
      res.status(404);
      throw error;
    }
    res.status(500);
    throw new Error('Failed to update draft');
  }
});

// Delete a draft
const deleteDraft = asyncHandler(async (req, res) => {
  const draftId = parseInt(req.params.id, 10); // Parse the draftId as an integer
  if (isNaN(draftId)) {
    res.status(400);
    throw new Error('Invalid draft ID');
  }

  try {
    // First check if the draft exists and belongs to the user
    const checkResult = await db.query(
      `SELECT d.id
       FROM drafts d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = $1 AND u.id = $2`,
      [draftId, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      res.status(404);
      throw new Error('Draft not found or unauthorized');
    }

    // Delete the draft
    await db.query(
      `DELETE FROM drafts
       WHERE id = $1 AND user_id = (
         SELECT id FROM users WHERE id = $2
       )`,
      [draftId, req.user.id]
    );

    res.json({ message: 'Draft deleted successfully' });
  } catch (error) {
    console.error('Error deleting draft:', error);
    if (error.message === 'Draft not found or unauthorized' || error.message === 'Invalid draft ID') {
      res.status(404);
      throw error;
    }
    res.status(500);
    throw new Error('Failed to delete draft');
  }
});

// Save draft to Google Drive
const saveToDrive = asyncHandler(async (req, res) => {
  const draftId = parseInt(req.params.id, 10); // Parse the draftId as an integer
  if (isNaN(draftId)) {
    res.status(400);
    throw new Error('Invalid draft ID');
  }

  try {
    // First check if the draft exists and belongs to the user
    const checkResult = await db.query(
      `SELECT d.id, d.title, d.content
       FROM drafts d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = $1 AND u.id = $2`,
      [draftId, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      res.status(404);
      throw new Error('Draft not found or unauthorized');
    }

    const draft = checkResult.rows[0];

    // Get user info to access their Google Drive
    const userResult = await db.query(
      `SELECT email
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      res.status(404);
      throw new Error('User not found');
    }

    const userEmail = userResult.rows[0].email;

    // Setup Google Drive connection
    const { drive, folderId } = await setupGoogleDrive(userEmail);

    // Create Google Doc
    const fileMetadata = {
      name: draft.title || 'Untitled Draft',
      mimeType: 'application/vnd.google-apps.document',
      parents: [folderId]
    };

    // Convert content to proper format
    const media = {
      mimeType: 'text/plain',
      body: draft.content || ''
    };

    // Upload file
    const driveResponse = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id,webViewLink'
    });

    const fileId = driveResponse.data.id;
    const webViewLink = driveResponse.data.webViewLink;

    console.log(`Draft "${draft.title}" saved to Google Drive with file ID: ${fileId}`);

    // Update the draft to mark it as saved
    const result = await db.query(
      `UPDATE drafts
       SET saved_to_cloud = TRUE,
           google_file_id = $1,
           updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id, title, content, saved_to_cloud AS "savedToCloud",
                google_file_id AS "googleFileId",
                created_at AS "createdAt", updated_at AS "updatedAt"`,
      [fileId, draftId, req.user.id]
    );

    const updatedDraft = result.rows[0];
    updatedDraft.userId = req.user.id;
    updatedDraft.webViewLink = webViewLink;

    res.json({
      message: 'Draft saved to Google Drive',
      draft: updatedDraft
    });
  } catch (error) {
    console.error('Error saving to Google Drive:', error);
    if (error.message === 'Draft not found or unauthorized' ||
        error.message === 'User not found' ||
        error.message === 'Invalid draft ID') {
      res.status(404);
      throw error;
    }
    res.status(500);
    throw new Error('Failed to save draft to Google Drive: ' + error.message);
  }
});

// Fetch user's drafts from Google Drive
const getDraftsFromDrive = asyncHandler(async (req, res) => {
  try {
    // Get user info
    const userResult = await db.query(
      `SELECT email
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      res.status(404);
      throw new Error('User not found');
    }

    const userEmail = userResult.rows[0].email;

    // Setup Google Drive connection
    const { drive, folderId } = await setupGoogleDrive(userEmail);

    // Get files from user's folder
    const filesResponse = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
      fields: 'files(id, name, webViewLink, createdTime, modifiedTime)',
      spaces: 'drive',
    });

    const files = filesResponse.data.files.map(file => ({
      id: file.id,
      title: file.name,
      content: "", // Content is not retrieved from the listing
      webViewLink: file.webViewLink,
      createdAt: file.createdTime,
      updatedAt: file.modifiedTime,
      fromDrive: true
    }));

    res.json(files);
  } catch (error) {
    console.error('Error fetching drafts from Google Drive:', error);
    res.status(500);
    throw new Error('Failed to fetch drafts from Google Drive');
  }
});

module.exports = {
  getDrafts,
  getDraft,
  createDraft,
  updateDraft,
  deleteDraft,
  saveToDrive,
  getDraftsFromDrive
};
