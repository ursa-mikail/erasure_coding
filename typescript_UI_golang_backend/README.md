# ◈ Erasure Coding Demo

**Interactive visualization of Reed-Solomon erasure coding with real-time shard destruction and cryptographic recovery verification.**

```
RS(10, 6) — 10 total shards · 6 data shards · 4 parity shards · GF(256)
```

---

## What Is Erasure Coding?

Erasure coding is a data protection method used in distributed storage systems (Ceph, HDFS, AWS S3, Backblaze). Instead of simple replication, it splits data into **k data shards** and computes **m parity shards** using Galois Field arithmetic.

This demo uses **Reed-Solomon RS(10, 6)**:
- 10 total shards per database
- 6 data shards (minimum required to reconstruct)
- 4 parity shards (redundancy)
- **Tolerance**: up to 4 simultaneous shard failures

As long as **any 6 of the 10 shards** survive, the original data can be perfectly reconstructed.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Port 3000)                   │
│              React + TypeScript Frontend                 │
│         Cyberpunk UI · Shard Grid · Recovery Log        │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP /api/*
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  Go Backend (Port 8080)                  │
│           Reed-Solomon GF(256) Implementation           │
│      Encode → Store → Destroy → Recover → Verify        │
└─────────────────────────────────────────────────────────┘
```

### Backend — Go
- Pure Go Reed-Solomon implementation using **Galois Field GF(256)**
- Vandermonde matrix for systematic encoding
- Gaussian elimination for matrix inversion during recovery
- SHA-256 integrity verification
- REST API via `gorilla/mux`

### Frontend — TypeScript + React
- Cyberpunk terminal aesthetic (Orbitron + Share Tech Mono fonts)
- Interactive shard grid — click to select shards for destruction
- Animated destruction with explosion effects
- Real-time recovery log with line-by-line animation
- SHA-256 hash comparison display
- Warning modal when destruction would cross recovery threshold

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 20.10
- [Docker Compose](https://docs.docker.com/compose/install/) ≥ 2.0
- Ports **3000** and **8080** available

---

## Quick Start

```bash
git clone <repo>
cd erasure-coding-demo

# Make scripts executable
chmod +x start.sh stop.sh

# Start everything (builds images, kills port conflicts, brings up services)
./start.sh
```

Open **http://localhost:3000**

To stop:
```bash
./stop.sh
```

---

## Manual Docker Commands

```bash
# Build and start
docker compose up --build -d

# View logs
docker compose logs -f

# Stop and remove containers
docker compose down

# Rebuild a single service
docker compose up --build backend -d
```

---

## API Reference

All endpoints at `http://localhost:8080/api`

### `GET /api/status`
Returns system configuration.
```json
{
  "status": "healthy",
  "total_shards": 10,
  "data_shards": 6,
  "parity_shards": 4,
  "threshold": 6
}
```

### `POST /api/generate`
Generates 4KB of random data, encodes it into 10 Reed-Solomon shards, returns SHA-256 of original.
```json
{
  "success": true,
  "original_hash": "a3f8c2...",
  "shard_count": 10,
  "data_size": 4096,
  "shards": [...]
}
```

### `GET /api/shards`
Returns current shard state.

### `POST /api/destroy`
Destroys specified shards. If destruction would make data unrecoverable and `force` is false, returns a warning instead.
```json
// Request
{ "shard_ids": [0, 3, 7], "force": false }

// Warning response (when crossing threshold without force)
{
  "warning": true,
  "unrecoverable": true,
  "surviving_shards": 5,
  "threshold": 6,
  "message": "WARNING: ..."
}

// Success response
{
  "success": true,
  "active_shards": 7,
  "destroyed_shards": 3,
  "recoverable": true,
  "status": "degraded"
}
```

### `POST /api/recover`
Attempts Reed-Solomon reconstruction from surviving shards. Verifies result with SHA-256.
```json
{
  "success": true,
  "verified": true,
  "log": ["🔍 Scanning shard availability...", "✅ Shard #0: OK", ...],
  "original_hash": "a3f8c2...",
  "recovered_hash": "a3f8c2...",
  "status": "healthy"
}
```

---

## How Reed-Solomon Works (in this demo)

### Encoding
```
Original 4096 bytes
  → Split into 6 chunks (data shards)
  → Build Vandermonde matrix M[10×6] over GF(256)
  → Compute 4 parity shards: P = M_parity × D
  → Store all 10 shards
```

### Recovery
```
Surviving shards (≥6 required)
  → Select any 6 available shards
  → Extract corresponding 6 rows from encoding matrix → submatrix S
  → Invert S using Gaussian elimination in GF(256)
  → Multiply: D = S⁻¹ × available_shard_data
  → Reconstruct original bytes
  → SHA-256 verify
```

### Galois Field GF(256)
All arithmetic uses the primitive polynomial `x⁸ + x⁴ + x³ + x² + 1` (0x11D). This ensures every non-zero element has a multiplicative inverse — essential for matrix inversion.

---

## Project Structure

```
erasure-coding-demo/
├── README.md
├── docker-compose.yml
├── start.sh                    # Full startup script (down + clean ports + up)
├── stop.sh                     # Graceful shutdown
│
├── backend/
│   ├── Dockerfile
│   ├── go.mod
│   ├── go.sum
│   └── main.go                 # RS encoder, decoder, REST API
│
└── frontend/
    ├── Dockerfile
    ├── nginx.conf              # Nginx reverse proxy config
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── App.tsx             # Main app, state machine, layout
        ├── App.css             # Cyberpunk terminal theme
        ├── api.ts              # API client
        ├── index.tsx           # Entry point
        ├── types/
        │   └── index.ts        # TypeScript interfaces
        └── components/
            ├── ShardNode.tsx   # Individual shard tile
            ├── RecoveryLog.tsx # Animated terminal log
            └── HashDisplay.tsx # SHA-256 visualization
```

---

## Configuration

To change the RS parameters, edit `backend/main.go`:

```go
const (
    TotalShards  = 10  // N — total shards
    DataShards   = 6   // K — minimum for recovery
    ParityShards = 4   // N - K
)
```

And update the constants in `frontend/src/App.tsx`:
```ts
const TOTAL_SHARDS = 10;
const DATA_SHARDS = 6;
```

---

## License

MIT
