import { Redirect, Route, Switch } from 'wouter';

import { CustomersPage } from './pages/CustomersPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { MapPage } from './pages/MapPage.js';
import { SessionProvider, useSession } from './session.js';

/** Sin sesión, cualquier dirección muestra el login; al entrar se queda en esa dirección. */
function Routes() {
  const { state } = useSession();
  if (state.status === 'loading') {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span className="muted">Conectando con el nodo local…</span>
      </div>
    );
  }
  if (state.status === 'out') {
    return <LoginPage notice={state.notice} />;
  }
  return (
    <Switch>
      <Route path="/" component={MapPage} />
      <Route path="/clientes" component={CustomersPage} />
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Routes />
    </SessionProvider>
  );
}
