import { Navigate, Route, Routes } from "react-router-dom";
import ShellLayout from "./components/ShellLayout";
import BalanceSnapshotsPage from "./pages/BalanceSnapshotsPage";
import ClientsPage from "./pages/ClientsPage";
import SacsReportPage from "./pages/SacsReportPage";

export default function App() {
  return (
    <ShellLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/clients" replace />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/balance-snapshots" element={<BalanceSnapshotsPage />} />
        <Route
          path="/reports/sacs/:snapshot_group_id"
          element={<SacsReportPage />}
        />
      </Routes>
    </ShellLayout>
  );
}
