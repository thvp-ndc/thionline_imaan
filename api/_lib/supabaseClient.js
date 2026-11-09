/**
 * @vnlan/online - Lightweight Serverless Supabase Client (Zero-Dependency)
 * Tận dụng native fetch của Node 18+ để gọi trực tiếp Supabase PostgREST API
 * - Tối ưu hóa kích thước Serverless Function (Cold-start < 50ms)
 * - Sử dụng SUPABASE_SERVICE_ROLE_KEY phía máy chủ (Không bao giờ lộ ra Client)
 */

class PostgrestQueryBuilder {
  constructor(baseUrl, apiKey, table) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.table = table;
    this.url = new URL(`${this.baseUrl}/rest/v1/${this.table}`);
    this.method = 'GET';
    this.body = null;
    this.headers = {
      'apikey': this.apiKey,
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    this.isSingle = false;
  }

  select(columns = '*') {
    this.method = 'GET';
    this.url.searchParams.set('select', columns);
    return this;
  }

  insert(data) {
    this.method = 'POST';
    this.body = JSON.stringify(data);
    return this;
  }

  upsert(data, onConflict = null) {
    this.method = 'POST';
    this.body = JSON.stringify(data);
    let prefer = 'resolution=merge-duplicates,return=representation';
    if (onConflict) {
      this.url.searchParams.set('on_conflict', onConflict);
    }
    this.headers['Prefer'] = prefer;
    return this;
  }

  update(data) {
    this.method = 'PATCH';
    this.body = JSON.stringify(data);
    return this;
  }

  delete() {
    this.method = 'DELETE';
    return this;
  }

  eq(column, value) {
    this.url.searchParams.set(column, `eq.${value}`);
    return this;
  }

  neq(column, value) {
    this.url.searchParams.set(column, `neq.${value}`);
    return this;
  }

  in(column, values = []) {
    this.url.searchParams.set(column, `in.(${values.join(',')})`);
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.url.searchParams.set('order', `${column}.${ascending ? 'asc' : 'desc'}`);
    return this;
  }

  limit(count) {
    this.url.searchParams.set('limit', String(count));
    return this;
  }

  single() {
    this.isSingle = true;
    this.headers['Accept'] = 'application/vnd.pgrst.object+json';
    return this;
  }

  async execute() {
    try {
      const response = await fetch(this.url.toString(), {
        method: this.method,
        headers: this.headers,
        body: this.body
      });

      if (!response.ok) {
        const errorText = await response.text();
        let parsedErr;
        try { parsedErr = JSON.parse(errorText); } catch (e) { parsedErr = { message: errorText }; }
        return { data: null, error: parsedErr };
      }

      if (response.status === 204) {
        return { data: null, error: null };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (err) {
      return { data: null, error: { message: err.message } };
    }
  }

  // Cho phép gọi trực tiếp: const { data, error } = await supabase.from('...').select()
  then(onfulfilled, onrejected) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class SupabaseServerClient {
  constructor(url, key) {
    this.url = url || process.env.SUPABASE_URL || 'https://omzfqtncmxfpkuvjambl.supabase.co';
    this.key = key || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  }

  from(table) {
    return new PostgrestQueryBuilder(this.url, this.key, table);
  }
}

// Khởi tạo Singleton client cho Serverless runtime
let serverClientInstance = null;

export function getSupabaseServerClient() {
  if (!serverClientInstance) {
    serverClientInstance = new SupabaseServerClient();
  }
  return serverClientInstance;
}

export default getSupabaseServerClient;
