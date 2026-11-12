# Fase 0 — OAuth Google em produção

Checklist operacional (sem segredos no repositório):

1. Google Cloud Console: ativar Calendar API e Tasks API; consentimento **Testing**; usuário de teste.
2. Cliente OAuth **Web** com redirect: `https://colabora-rouge.vercel.app/api/google/callback` (confirmar `GOOGLE_REDIRECT_URI` na Vercel).
3. Na Vercel, ambiente **Production** apenas:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_ENABLED=true`
4. Redeploy (`git push` na `main` ou `npx vercel --prod --scope villarinhoguis-projects`).
5. Validar: sessão ativa → `GET /api/google/status` → `configured: true`.

Opcional: `CRON_SECRET` (ou reutilizar lógica de `REMINDER_DISPATCH_SECRET`) para o cron diário `/api/google/jobs/tick`.
