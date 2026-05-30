/* =============================================
   BaoQi — supabase.js
   Helper para llamadas a la API REST de Supabase
   ============================================= */

const SB_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SB_KEY,
  'Authorization': 'Bearer ' + SB_KEY
};

async function sb(table, method = 'GET', body = null, query = '') {
  const opts = {
    method,
    headers: {
      ...SB_HEADERS,
      ...(method !== 'GET' ? { 'Prefer': 'return=representation' } : {})
    },
    body: body ? JSON.stringify(body) : null
  };
  const res = await fetch(`${SB_URL}/rest/v1/${table}${query}`, opts);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return method === 'DELETE' ? null : res.json();
}
