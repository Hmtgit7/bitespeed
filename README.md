# Bitespeed Identity Reconciliation

Backend service that links customer contacts across multiple purchases — even when they use different emails or phone numbers each time.

Built for the [Bitespeed Backend Task](https://bitespeed.notion.site/Bitespeed-Backend-Task-Identity-Reconciliation-53392ab01fe149fab989422300423199).

**Live endpoint:** `https://bitespeed-dzzi.onrender.com/identify`  
**GitHub:** `https://github.com/Hmtgit7/bitespeed`

---

## The Problem

Doc Brown buys flux capacitor parts from FluxKart using a different email each time. Bitespeed needs to figure out all those orders came from the same person.

This service does exactly that — it takes an email or phone number, finds all related contacts in the database, and returns them consolidated under one primary contact.

---

## Stack

- **Node.js + TypeScript** — runtime and language
- **Express.js** — HTTP framework
- **Prisma 7** — ORM
- **PostgreSQL** — database (Neon)
- **Docker** — containerization
- **Render.com** — hosting

---

## API

### `POST /identify`

Send either an email, a phone number, or both.

```bash
curl -X POST https://bitespeed-dzzi.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "mcfly@hillvalley.edu", "phoneNumber": "123456"}'
```

**Response:**

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

Primary contact's email and phone always come first in their respective arrays.

---

## How contacts get linked

**New contact** — no match found → creates a fresh primary contact

**New info on existing contact** — email or phone matches someone already in the DB but the request has new data → creates a secondary contact linked to the primary

**Two clusters merging** — request contains an email from one cluster and a phone from another → the older primary stays, the newer one becomes secondary

Example:

```bash
# Creates primary contact (id: 1)
curl -X POST https://bitespeed-dzzi.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "george@hillvalley.edu", "phoneNumber": "919191"}'

# Creates another primary contact (id: 2)
curl -X POST https://bitespeed-dzzi.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "biffsucks@hillvalley.edu", "phoneNumber": "717171"}'

# Links both clusters — id:2 becomes secondary under id:1
curl -X POST https://bitespeed-dzzi.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "george@hillvalley.edu", "phoneNumber": "717171"}'
```

Result:

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["george@hillvalley.edu", "biffsucks@hillvalley.edu"],
    "phoneNumbers": ["919191", "717171"],
    "secondaryContactIds": [2]
  }
}
```

---

## Running locally

**Prerequisites:** Node.js 18+, PostgreSQL

```bash
git clone https://github.com/Hmtgit7/bitespeed.git
cd bitespeed

npm install

cp .env.example .env
# add your DATABASE_URL to .env

npx prisma generate
npx prisma migrate dev --name init

npm run dev
# server starts at http://localhost:3000
```

**Or with Docker:**

```bash
docker-compose up --build
# spins up the app + postgres together
```

---

## Project structure

```
src/
  index.ts                    # entry point
  routes/identify.ts          # POST /identify
  controllers/                # request validation
  services/contactService.ts  # core reconciliation logic
prisma/
  schema.prisma               # Contact model
  migrations/                 # SQL migration history
Dockerfile                    # multi-stage build
docker-compose.yml            # local dev with postgres
.github/workflows/ci.yml      # lint → deploy pipeline
```

---

## CI/CD

Every push to `master`:

1. GitHub Actions runs lint and TypeScript build check
2. If both pass, triggers a Render deploy via webhook
3. Render builds the Docker image and runs `prisma migrate deploy` before starting the server

PRs only run the lint and build check — they don't deploy.
