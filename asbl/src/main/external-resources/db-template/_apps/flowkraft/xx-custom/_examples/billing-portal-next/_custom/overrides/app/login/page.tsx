export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex justify-center items-start pt-10 p-4">
      <div className="card bg-base-100 border border-base-300 shadow-lg w-full max-w-sm">
        <div className="card-body">
          <h2 className="card-title justify-center mb-1"><span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-primary-content font-bold">N</span> Northwind Traders</h2>
          <p className="text-base-content/60 text-sm text-center mb-4">Sign in to view and pay your invoices</p>

          {error ? (
            <div id="login-error" className="alert alert-soft alert-error text-sm mb-3">Invalid username or password</div>
          ) : null}

          <form action="/api/auth/login" method="post">
            <label className="form-control w-full mb-3">
              <span className="label-text mb-1">Username</span>
              <input id="login-username" name="username" type="text" autoComplete="username"
                     className="input input-bordered w-full" placeholder="you@example.com" required />
            </label>
            <label className="form-control w-full mb-4">
              <span className="label-text mb-1">Password</span>
              <input id="login-password" name="password" type="password" autoComplete="current-password"
                     className="input input-bordered w-full" placeholder="••••••••" required />
            </label>
            <button id="btn-login" type="submit" className="btn btn-primary w-full">Sign In</button>
          </form>

          <div className="divider text-xs text-base-content/50 my-4">demo logins</div>
          <div className="text-xs text-base-content/60 space-y-1">
            <div><span className="badge badge-outline badge-sm">admin</span> <code>admin</code> / <code>admin123</code></div>
            <div><span className="badge badge-outline badge-sm">customer</span> <code>alice@demo.io</code> · <code>bob@demo.io</code> · <code>carol@demo.io</code> / <code>demo1234</code></div>
          </div>
        </div>
      </div>
    </div>
  );
}
