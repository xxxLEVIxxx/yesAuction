This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Firebase Realtime Database — auction data

- **`auctions/catalog/{auctionId}`** — Admin-created auctions (title, summary, description, `startAt`, optional `endAt`, `status`). Shown on the public homepage (except `draft`).
- **`auctions/rounds/{auctionId}/{roundId}`** — Rounds within an auction (e.g. Day 1 / Day 2): `label`, `description`, `startAt`/`endAt`, `order`. Shown on the homepage under each auction; lots can link with `roundId`.
- **`auctions/lots/{lotId}`** — Lots with `auctionId`, optional `roundId`, `number`, `title`, `estimate`. Admin **拍品与场次** supports CSV / Excel import (`xlsx`); imported rows include `source: "import"` and require a selected **轮次**.
- **`auctionJoinRequests/{auctionId}/{userId}`** — User “申请参拍” from the homepage; includes `depositStatus` (`pending` | `waived` | `pay_required`) and `processed` for admin review under **参拍审核**.
- **`auctions/current`** — Current lot on the block (used by `/bid`); unchanged.

**Rules:** allow public **read** on `auctions/catalog` and `auctions/lots` for the homepage. **Write** to these paths must be allowed for your admin flow (the admin UI uses the client SDK; lock down in production, e.g. only from trusted networks or migrate writes to a server with Firebase Admin).

**Env:** `NEXT_PUBLIC_SECURITY_DEPOSIT_URL` — optional. When a join request is approved with **需缴纳保证金**, the homepage shows a **缴纳保证金** button opening this URL (with `?auctionId=` appended). Defaults to `https://theyesauction.com` if unset.

**Env:** `NEXT_PUBLIC_MAIN_SITE_URL` — optional. Homepage auction cards link **官网拍品目录** to this URL (defaults to `https://theyesauction.com`).

**Mobile / LAN dev:** Open the app via `http://192.168.x.x:3000` only if that host is added in **Firebase Console → Authentication → Settings → Authorized domains** (e.g. `192.168.1.112`). Otherwise Auth may not finish and the home page can stay on loading until timeouts.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
