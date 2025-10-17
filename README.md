# WHEP-SRT GATEWAY

> _Open Source WHEP SRT Gateway_

A Docker container to receive WebRTC streams via WHEP (WebRTC HTTP Egress Protocol) and output to SRT (Secure Reliable Transport) for reliable streaming distribution.

## Overview

This gateway does the **reverse** of the [SRT-WHIP Gateway](https://github.com/Eyevinn/srt-whip-gateway):

- **SRT-WHIP Gateway**: Receives MPEG-TS over SRT → Transmits to WHIP endpoint
- **WHEP-SRT Gateway**: Receives from WHEP endpoint → Transmits MPEG-TS over SRT

A receiver is a WHEP client and SRT transmitter based on the `whep-srt` [command line tool](https://github.com/Eyevinn/whep-srt). Each receiver is configured with a specific WHEP URL and SRT output URL. The receivers can be managed via the REST API or the Web GUI.

## Features

- **Automatic Restart**: Failed receivers automatically restart with exponential backoff (1s, 2s, 4s, 8s, etc.)
- **Auto-Start**: Newly created receivers automatically start
- **Error Logging**: Detailed error output from whep-srt process logged at error level
- **Web GUI**: User-friendly interface for managing receivers
- **REST API**: Full programmatic control with Swagger documentation

## Use Cases

- Distribute WebRTC streams to SRT endpoints
- Bridge WebRTC to traditional broadcast infrastructure
- Consume WHEP streams and relay to SRT ingest points
- Create low-latency distribution networks

## Supported Formats

Currently, `whep-srt` is **audio-only**. Video tracks are discarded.

| IN (WHEP/WebRTC) | OUT (SRT/MPEG-TS) |
| ---------------- | ----------------- |
| OPUS             | AAC               |

## Run WHEP SRT Gateway

To run the latest version of WHEP SRT Gateway:

```bash
docker run -d -p 3001:3001 \
  eyevinntechnology/whep-srt-gateway
```

Once the container is up and running you can access:

- API swagger at `http://localhost:3001/api/docs`
- API at `http://localhost:3001/api/v1/`
- Web GUI at `http://localhost:3001/ui`

## Usage Guide

### Add a Receiver

To add a receiver:

1. Enter a unique **Receiver ID** (e.g., `receiver-1`, or any non-empty string)
   - The GUI suggests sequential IDs like `rx-1`, `rx-2`, etc.
2. Enter the **WHEP URL** of the WebRTC stream source
3. Enter the **SRT Output URL** where the stream should be sent
   - Use `srt://0.0.0.0:9000?mode=listener` to listen for incoming SRT connections
   - Use `srt://192.168.1.100:9000?mode=caller` to push to a specific SRT endpoint
4. Press the **Add** button

**Note**: The receiver will automatically start after being added.

### Automatic Restart

If a receiver fails, it will automatically restart with exponential backoff:

- First retry: 1 second
- Second retry: 2 seconds
- Third retry: 4 seconds
- And so on, doubling each time

Manual start/stop operations reset the retry timeout back to 1 second.

### Start/Stop Receiver

A receiver with a green border is `idle` or `stopped`. A red box indicates a `running` receiver. A yellow border indicates a `failed` receiver (which will automatically retry).

Click anywhere in the receiver box to toggle between running and stopped states.

When the receiver is running, it will connect to the WHEP endpoint and begin streaming to the configured SRT URL.

### Remove Receiver

To remove a receiver, click on the **X** in the top right corner of the receiver box. The receiver must be stopped before it can be removed.

## Development

### Prerequisites

- Node.js 18+
- npm

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build        # Build TypeScript
npm run build:ui     # Build UI
```

### Run Development Server

```bash
npm run dev          # Run server with auto-reload
npm run dev:ui       # Run UI development server
```

### Run Tests

```bash
npm test
```

## API Documentation

When the server is running, you can access the interactive API documentation at:

```
http://localhost:3001/api/docs
```

### Key Endpoints

- `GET /api/v1/rx` - List all receivers
- `POST /api/v1/rx` - Create a new receiver
- `GET /api/v1/rx/:id` - Get receiver details
- `PUT /api/v1/rx/:id/state` - Start/stop a receiver
- `DELETE /api/v1/rx/:id` - Remove a receiver

## Environment Variables

- `PORT` - Server port (default: 3001)
- `API_KEY` - Optional API key for authentication
- `NODE_ENV` - Environment mode (`development` or `production`)

## Architecture

```
┌─────────────┐
│   WHEP      │
│  Endpoint   │
│  (WebRTC)   │
└─────┬───────┘
      │
      │ WebRTC/RTP
      │
┌─────▼───────┐
│   WHEP-SRT  │
│   Gateway   │
│             │
│  ┌────────┐ │
│  │whep-srt│ │
│  └────────┘ │
└─────┬───────┘
      │
      │ SRT/MPEG-TS
      │
┌─────▼───────┐
│    SRT      │
│  Receiver   │
└─────────────┘
```

## Building Docker Image

```bash
docker build -t whep-srt-gateway .
```

## Contributing

If you're interested in contributing to the project:

- We welcome all people who want to contribute in a healthy and constructive manner within our community.
- Create a Pull Request with suggested changes.
- Report, triage bugs or suggest enhancements.
- Help others by answering questions.

## License (Apache-2.0)

```
Copyright 2025 Eyevinn Technology AB

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

## Support

Join our [community on Slack](http://slack.streamingtech.se) where you can post any questions regarding any of our open source projects.

## About Eyevinn Technology

[Eyevinn Technology](https://www.eyevinntechnology.se) is an independent consultant firm specialized in video and streaming. Independent in a way that we are not commercially tied to any platform or technology vendor. As our way to innovate and push the industry forward we develop proof-of-concepts and tools. The things we learn and the code we write we share with the industry in [blogs](https://dev.to/video) and by open sourcing the code we have written.

Want to know more about Eyevinn and how it is to work here? Contact us at work@eyevinn.se!
