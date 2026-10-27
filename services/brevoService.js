import axios from 'axios';

/**
 * Brevo API service for sending transactional emails
 */
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Sends an email using the Brevo Transactional Email API
 * @param {Object} emailData - Email data object
 * @param {string} emailData.to - Recipient email address
 * @param {string} emailData.toName - Recipient name
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.htmlContent - HTML email content
 * @returns {Promise<Object>} - Response from Brevo API
 * @throws {Error} - If the API call fails
 */
export async function sendEmail(emailData) {
  const {
    to,
    toName = 'Hotel Manager',
    subject,
    htmlContent
  } = emailData;

  const senderEmail = process.env.SENDER_EMAIL;
  const apiKey = process.env.BREVO_API_KEY;

  if (!senderEmail) {
    throw new Error('SENDER_EMAIL environment variable is not set');
  }

  if (!apiKey) {
    throw new Error('BREVO_API_KEY environment variable is not set');
  }

  if (!to) {
    throw new Error('Recipient email address is required');
  }

  if (!subject) {
    throw new Error('Email subject is required');
  }

  if (!htmlContent) {
    throw new Error('Email HTML content is required');
  }

  try {
    const payload = {
      sender: {
        name: 'AI Hotel Agent',
        email: senderEmail
      },
      to: [
        {
          email: to,
          name: toName
        }
      ],
      subject: subject,
      htmlContent: htmlContent
    };

    const response = await axios.post(BREVO_API_URL, payload, {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    return response.data;
  } catch (error) {
    // Handle different types of errors
    // TEMPORARY LOG FOR DEBUGGING
    console.error('RAW BREVO ERROR:', error.response?.data || error.message);
    if (error.response) {
      const errorMessage = error.response.data?.message || error.response.statusText;
      throw new Error(`Brevo API error (${error.response.status}): ${errorMessage}`);
    } else if (error.request) {
      throw new Error('No response received from Brevo API. Request timed out or network error.');
    } else {
      throw new Error(`Error sending email via Brevo: ${error.message}`);
    }
  }
}
