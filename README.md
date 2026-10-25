# Vapi Call Summary Service

A production-ready Node.js Express backend service that receives Vapi Voice Agent end-of-call webhooks, parses call transcripts and AI summaries, and dispatches formatted HTML summary emails to hotel managers using the Brevo Transactional Email API.

## Tech Stack

- **Runtime**: Node.js 18+ (LTS)
- **Framework**: Express.js
- **HTTP Client**: Axios
- **Deployment**: Google Cloud Platform (GCP) Cloud Run

## Features

- ✅ Health check endpoint for Cloud Run
- ✅ Vapi webhook validation with optional secret token
- ✅ Robust error handling and logging
- ✅ Responsive HTML email templates
- ✅ Production-optimized Dockerfile
- ✅ Security-focused (non-root user, minimal dependencies)

## Project Structure

```
VapiCallSummary/
├── server.js                 # Main Express application
├── services/
│   └── brevoService.js      # Brevo API integration
├── utils/
│   └── emailTemplate.js     # HTML email template generator
├── package.json             # Dependencies and scripts
├── Dockerfile               # Multi-stage Docker build
├── .env.example             # Environment variables template
└── README.md                # This file
```

## Environment Variables

Copy `.env.example` to `.env` and configure the following variables:

```env
PORT=8080                                    # Service port (Cloud Run sets this)
BREVO_API_KEY=your_brevo_api_key_here        # Your Brevo API key
SENDER_EMAIL=ai-agent@yourdomain.com         # Sender email address
HOTEL_MANAGER_EMAIL=bookings@hotel.com        # Hotel manager email
VAPI_WEBHOOK_SECRET=optional_secret_token    # Optional webhook secret
SKIP_EMAIL=false                             # Set to 'true' to skip email sending (for testing)
```

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your actual values
```

3. Start the server:
```bash
npm start
# Or for development with auto-reload:
npm run dev
```

4. Test the health endpoint:
```bash
curl http://localhost:8080/health
```

### Testing with ngrok

To test webhooks locally with Vapi:

1. Start the server with `SKIP_EMAIL=true` to avoid sending real emails:
```bash
SKIP_EMAIL=true npm start
```

2. Start ngrok to expose your local server:
```bash
ngrok http 8080
```

3. Copy the ngrok HTTPS URL (e.g., `https://xxx.ngrok-free.dev`)

4. Configure Vapi webhook endpoint as:
```
https://xxx.ngrok-free.dev/api/vapi/webhook
```

## Deployment to Google Cloud Run

### 1. Build the Docker Image

```bash
# Build the image
docker build -t vapi-call-summary-service .

# Tag for Google Artifact Registry
docker tag vapi-call-summary-service gcr.io/PROJECT_ID/vapi-call-summary-service
```

### 2. Push to Google Artifact Registry

```bash
docker push gcr.io/PROJECT_ID/vapi-call-summary-service
```

### 3. Deploy to Cloud Run

```bash
gcloud run deploy vapi-call-summary-service \
  --image gcr.io/PROJECT_ID/vapi-call-summary-service \
  --platform managed \
  --region REGION \
  --allow-unauthenticated \
  --set-env-vars="BREVO_API_KEY=your_key,SENDER_EMAIL=sender@example.com,HOTEL_MANAGER_EMAIL=manager@example.com,VAPI_WEBHOOK_SECRET=your_secret"
```

### 4. Get the Service URL

```bash
gcloud run services describe vapi-call-summary-service \
  --platform managed \
  --region REGION \
  --format 'value(status.url)'
```

## API Endpoints

### GET /health
Health check endpoint for Cloud Run.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### POST /api/vapi/webhook
Receives Vapi end-of-call-report webhooks and sends email summaries.

**Headers:**
- `Content-Type: application/json`
- `x-vapi-webhook-secret` (optional, if VAPI_WEBHOOK_SECRET is configured)

**Request Body:**
Vapi webhook payload with the following structure:
```json
{
  "message": {
    "call": {
      "customer": {
        "number": "+1234567890"
      },
      "startedAt": "2024-01-01T10:00:00Z",
      "endedAt": "2024-01-01T10:05:30Z"
    },
    "analysis": {
      "summary": "Customer inquired about room availability for next weekend..."
    },
    "artifact": {
      "transcript": "Full conversation transcript here..."
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Call summary email sent successfully"
}
```

## Security Considerations

- Webhook validation using optional secret token
- All sensitive data stored in environment variables
- Non-root user in Docker container
- Minimal dependencies to reduce attack surface
- Error messages don't expose sensitive information

## Troubleshooting

### Email Not Sending
- Verify BREVO_API_KEY is correct
- Check SENDER_EMAIL is verified in Brevo
- Ensure HOTEL_MANAGER_EMAIL is valid
- Check Cloud Run logs: `gcloud logs tail`

### Webhook Rejected
- Verify VAPI_WEBHOOK_SECRET matches in both Vapi and Cloud Run
- Check Content-Type header is application/json
- Review webhook payload structure

### Docker Build Failures
- Ensure Docker daemon is running
- Check Node.js version (requires 18+)
- Verify network connectivity for package downloads

## License

ISC
