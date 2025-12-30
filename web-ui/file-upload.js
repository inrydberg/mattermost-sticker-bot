const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function uploadFile(serverUrl, botToken, channelId, filePath, filename) {
    try {
        const stats = await fs.promises.stat(filePath);
        const fileStream = fs.createReadStream(filePath);

        const form = new FormData();
        form.append('files', fileStream, {
            filename: filename || path.basename(filePath),
            contentType: 'image/gif'
        });
        form.append('channel_id', channelId);

        const response = await axios.post(
            `${serverUrl}/api/v4/files`,
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Bearer ${botToken}`
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        if (response.data && response.data.file_infos && response.data.file_infos.length > 0) {
            return response.data.file_infos[0];
        }

        throw new Error('No file info returned');
    } catch (error) {
        console.error('File upload failed:', error.response?.data || error.message);
        throw error;
    }
}

async function sendFileAsPost(serverUrl, botToken, channelId, fileInfo, message = '') {
    try {
        const postData = {
            channel_id: channelId,
            message: message,
            file_ids: [fileInfo.id]
        };

        const response = await axios.post(
            `${serverUrl}/api/v4/posts`,
            postData,
            {
                headers: {
                    'Authorization': `Bearer ${botToken}`
                }
            }
        );

        return response.data;
    } catch (error) {
        console.error('Failed to send file post:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = { uploadFile, sendFileAsPost };