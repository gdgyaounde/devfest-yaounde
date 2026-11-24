# Sending the event certificates

After the event, every attendee, speaker, volunteer and organiser who was there gets a PDF certificate by email. Each one has a number and a QR code that opens a page on the site saying it's genuine.

The certificates are made and sent from a **Google Sheet** (menu **Certificates**). The step-by-step guide lives next to its code: **`tools/certificates/README.md`**.

What the site does:

- **Dashboard → Certificates → Download the list**: everyone the site knows was there (checked-in tickets and reservations, volunteers, speakers marked as arrived, the team), ready to paste into the sheet. Add speakers' and organisers' emails, and the Bevy free passes, by hand.
- **Dashboard → Certificates → Issued**: every certificate the sheet has generated. **Revoke** one to make its QR page say it's no longer valid; **Restore** undoes that.
- **`devfest.gdgyaounde.com/certificates/<number>`**: the public page the QR code opens.

Turning it on, once per site:

1. Run `supabase/migrations/0048_certificates.sql` in Supabase.
2. Set `CERTIFICATES_SECRET` on Vercel (generate it with `openssl rand -hex 32`), and paste the same value in the sheet: **Certificates → Connect to the site**.
