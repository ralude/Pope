import { Redirect, Route, Switch } from 'wouter';

import { CombosPage } from './pages/CombosPage.js';
import { CustomersPage } from './pages/CustomersPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { MapPage } from './pages/MapPage.js';
import { SessionProvider, useSession } from './session.js';
import { ShiftProvider } from './shift.js';
import { StaffPage } from './pages/StaffPage.js';
import { TariffsPage } from './pages/TariffsPage.js';

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
    <ShiftProvider>
      <Switch>
        <Route path="/" component={MapPage} />
        <Route path="/clientes" component={CustomersPage} />
        <Route path="/combo-horas" component={CombosPage} />
        <Route path="/tarifas" component={TariffsPage} />
        {state.staff.role === 'administrador' && <Route path="/personal" component={StaffPage} />}
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
    </ShiftProvider>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Routes />
    </SessionProvider>
  );
}
