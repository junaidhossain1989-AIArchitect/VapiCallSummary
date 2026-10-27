import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { sendEmail } from './services/brevoService.js';
import { generateEmailTemplate } from './utils/emailTemplate.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
//app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/**
 * Validates Vapi webhook request using secret token if configured
 * @param {Object} req - Express request object
 * @returns {boolean} - True if valid, false otherwise
 */
 function validateWebhook(req) {
  const webhookSecret = process.env.VAPI_WEBHOOK_SECRET;
  
  // If no secret is configured, skip validation (for development/testing)
  if (!webhookSecret) {
    return true;
  }

  // Check for the secret in headers (adjust header name based on Vapi's implementation)
  const providedSecret = req.headers['x-vapi-webhook-secret'] || 
                         req.headers['x-webhook-secret'] || 
                         req.headers['authorization'];

  if (!providedSecret) {
    return false;
  }

  // Support both plain secret and Bearer token format
  const token = providedSecret.startsWith('Bearer ') 
    ? providedSecret.substring(7) 
    : providedSecret;

  return token === webhookSecret;
 }

/**
 * Extracts call data from Vapi webhook payload
 * @param {Object} payload - Vapi webhook payload
 * @returns {Object} - Extracted call data
 */
function extractCallData(payload) {
  try {
    const message = payload.message || {};
    const call = message.call || {};
    const analysis = message.analysis || {};
    const artifact = message.artifact || {};

    // 1. Extract Transcript
    let transcript = 'Transcript not available';
    if (artifact.transcript) {
      transcript = artifact.transcript;
    } else if (message.transcript) {
      transcript = message.transcript;
    } else if (message.messages && Array.isArray(message.messages)) {
      transcript = message.messages
        .map(msg => `${msg.role || 'unknown'}: ${msg.message || ''}`)
        .join('\n');
    }

    // 2. Extract Summary from structuredOutputs (where Vapi's Structured Output results live)
    let summary = 'No summary provided by AI';
    
    // Check message.structuredOutputs or message.analysis.structuredOutputs
    const structuredOutputs = message.structuredOutputs || analysis.structuredOutputs;
    
    if (structuredOutputs && typeof structuredOutputs === 'object') {
      const keys = Object.keys(structuredOutputs);
      for (const key of keys) {
        const item = structuredOutputs[key];
        if (item && item.result) {
          summary = item.result;
          break;
        }
      }
    }

    // Fallbacks if structuredOutputs wasn't populated
    if (summary === 'No summary provided by AI' && analysis.summary) {
      summary = analysis.summary;
    } else if (summary === 'No summary provided by AI' && message.toolCalls && Array.isArray(message.toolCalls)) {
      for (const toolCall of message.toolCalls) {
        if (toolCall.function && toolCall.function.name === 'Summarise_Call' && toolCall.function.arguments) {
          const args = toolCall.function.arguments;
          const parts = [];
          if (args.callerName) parts.push(`Caller: ${args.callerName}`);
          if (args.contactDetail) parts.push(`Contact: ${args.contactDetail}`);
          if (args.enquirySummary) parts.push(`Enquiry: ${args.enquirySummary}`);
          if (parts.length > 0) summary = parts.join('. ');
          break;
        }
      }
    }

    // 3. Extract Customer Phone Number
    let customerPhone = call.customer?.number || call.customerNumber || 'Unknown';
    
    // If phone is unknown, try to parse it out of the summary text or transcript using regex
    if (customerPhone === 'Unknown' || customerPhone.length < 5) {
      const textToSearch = summary + ' ' + transcript;
      const phoneRegex = /(\+?\d{2,4}[\s-]?)?(\d{3,5}[\s-]?\d{4,6})/g;
      const match = textToSearch.match(/(?:number|contact)[:\s]*([0-9\s-]+)/i) || textToSearch.match(/(\d{5}\s?\d{5})/);
      if (match && match[1]) {
        customerPhone = match[1].trim();
      }
    }

    // 4. Extract Timestamps & Duration
    const startedAt = call.startedAt;
    const endedAt = call.endedAt;
    let callDuration = 'N/A';
    let timestamp = 'N/A';

    if (startedAt && endedAt) {
      const startDate = new Date(startedAt);
      const endDate = new Date(endedAt);
      const durationMs = endDate - startDate;
      const durationSeconds = Math.floor(durationMs / 1000);
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = durationSeconds % 60;
      callDuration = `${minutes}m ${seconds}s`;
      timestamp = startDate.toISOString();
    } else if (startedAt) {
      timestamp = new Date(startedAt).toISOString();
    }

    return {
      customerPhone,
      callDuration,
      timestamp,
      summary,
      transcript
    };
  } catch (error) {
    console.error('Error extracting call data:', error);
    throw new Error('Failed to extract call data from webhook payload');
  }
}
/**
 * Health check endpoint for Cloud Run
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

/**
 * Vapi webhook endpoint for end-of-call reports
 */
app.post('/api/vapi/webhook', async (req, res) => {
  try {
    // Validate webhook secret if configured
    // if (!validateWebhook(req)) {
    //   console.error('Webhook validation failed: Invalid or missing secret');
    //   return res.status(401).json({
    //     error: 'Unauthorized',
    //     message: 'Invalid webhook secret'
    //   });
    // }

    // Only process end-of-call-report events to avoid duplicate emails
    const messageType = req.body.message?.type;
    if (messageType !== 'end-of-call-report') {
      console.log(`Skipping webhook event: ${messageType || 'unknown'}`);
      return res.status(200).json({
        success: true,
        message: 'Webhook received but not processed (not end-of-call-report)'
      });
    }

    // Extract call data from payload
    const callData = extractCallData(req.body);

    console.log(`Processing call summary for customer: ${callData.customerPhone}`);

    // Generate HTML email content
    const htmlContent = generateEmailTemplate(callData);

    // Prepare email data
    const hotelManagerEmail = process.env.HOTEL_MANAGER_EMAIL;
    if (!hotelManagerEmail) {
      throw new Error('HOTEL_MANAGER_EMAIL environment variable is not set');
    }

    const emailData = {
      to: hotelManagerEmail,
      toName: 'Hotel Manager',
      subject: `[AI Call Summary] Guest Enquiry - ${callData.customerPhone}`,
      htmlContent: htmlContent
    };

    // Send email via Brevo (skip if SKIP_EMAIL env var is set for testing)
    if (process.env.SKIP_EMAIL === 'true') {
      console.log(`SKIP_EMAIL is true - skipping email dispatch to ${hotelManagerEmail}`);
      console.log(`Email content would have been sent (length: ${htmlContent.length} chars)`);
    } else {
      await sendEmail(emailData);
      console.log(`Email successfully sent to ${hotelManagerEmail}`);
    }

    // Return success response to Vapi
    res.status(200).json({
      success: true,
      message: 'Call summary email sent successfully'
    });

  } catch (error) {
    console.error('Error processing webhook:', error);

    // Return error response but don't expose sensitive details
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process webhook and send email'
    });
  }
});

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Vapi Call Summary Service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      webhook: '/api/vapi/webhook'
    }
  });
});

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred'
  });
});

/**
 * Start the server
 */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Vapi Call Summary Service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/api/vapi/webhook`);
});
