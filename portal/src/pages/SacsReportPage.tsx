import AttachMoneyRoundedIcon from "@mui/icons-material/AttachMoneyRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";

const SAVINGS_ROUNDED_PATH =
  "m19.83 7.5-2.27-2.27c.07-.42.18-.81.32-1.15.11-.26.15-.56.09-.87-.13-.72-.83-1.22-1.57-1.21-1.59.03-3 .81-3.9 2h-5C4.46 4 2 6.46 2 9.5c0 2.25 1.37 7.48 2.08 10.04.24.86 1.03 1.46 1.93 1.46H8c1.1 0 2-.9 2-2h2c0 1.1.9 2 2 2h2.01c.88 0 1.66-.58 1.92-1.43l1.25-4.16 2.14-.72c.41-.14.68-.52.68-.95V8.5c0-.55-.45-1-1-1zM12 9H9c-.55 0-1-.45-1-1s.45-1 1-1h3c.55 0 1 .45 1 1s-.45 1-1 1m4 2c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, reportApi } from "../lib/api";
import type { SacsReport } from "../types/finance";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong while loading the report.";
}

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 620;

const INFLOW = { cx: 220, cy: 240, r: 130 };
const OUTFLOW = { cx: 680, cy: 240, r: 130 };
const RESERVE = { cx: 450, cy: 500, r: 110 };

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export default function SacsReportPage() {
  const { snapshot_group_id } = useParams<{ snapshot_group_id: string }>();
  const [report, setReport] = useState<SacsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleDownloadPdf() {
    if (!snapshot_group_id || !report) {
      return;
    }
    setExporting(true);
    setError(null);
    try {
      let response: Response;
      try {
        response = await fetch(
          `${API_BASE_URL}/balance-snapshot-groups/${snapshot_group_id}/sacs-report.pdf`,
        );
      } catch (networkError) {
        throw new Error(
          `Could not reach the PDF endpoint at ${API_BASE_URL}. ` +
            "Check that the FastAPI server is running and that the " +
            "WeasyPrint native dependencies are installed. " +
            `(${getErrorMessage(networkError)})`,
        );
      }
      if (!response.ok) {
        let detail = `status ${response.status}`;
        try {
          const payload = (await response.json()) as { detail?: string };
          if (payload.detail) {
            detail = payload.detail;
          }
        } catch {
          // fall back to status code
        }
        throw new Error(`Failed to generate PDF: ${detail}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeName =
        report.household_name.replace(/\s+/g, "_") || "household";
      link.download = `sacs-report-${safeName}-${snapshot_group_id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    async function load() {
      if (!snapshot_group_id) {
        setError("Missing snapshot group id.");
        setLoading(false);
        return;
      }
      const groupId = Number(snapshot_group_id);
      if (!Number.isFinite(groupId)) {
        setError("Invalid snapshot group id.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await reportApi.sacs(groupId);
        setReport(data);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [snapshot_group_id]);

  if (loading) {
    return (
      <Stack direction="row" spacing={2} alignItems="center" sx={{ p: 3 }}>
        <CircularProgress size={20} />
        <Typography color="text.secondary">Loading SACS report...</Typography>
      </Stack>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!report) {
    return <Alert severity="warning">Report not available.</Alert>;
  }

  const inflowArrowLabel = `X = ${formatCurrency(report.monthly_outflow)}/month*`;
  const reserveArrowLabel = `${formatCurrency(report.monthly_private_reserve)}/month*`;

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={
            exporting ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <PictureAsPdfRoundedIcon />
            )
          }
          onClick={() => void handleDownloadPdf()}
          disabled={exporting}
        >
          Export to PDF
        </Button>
      </Box>

      <Paper
        variant="outlined"
        sx={{
          p: 3,
          bgcolor: "background.paper",
          overflowX: "auto",
        }}
      >
        <Stack spacing={0.5} alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h4" fontWeight={700} align="center">
            Simple Automated Cashflow System (SACS)
          </Typography>
          <Typography variant="h5" color="text.secondary" align="center">
            {report.household_name}
            {report.group_date ? ` - ${report.group_date}` : ""}
          </Typography>
        </Stack>
        <Box
          sx={{
            position: "relative",
            width: "100%",
            maxWidth: CANVAS_WIDTH,
            mx: "auto",
          }}
        >
          <svg
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            width="100%"
            role="img"
            aria-label="Simple Automated Cashflow System diagram"
            style={{ display: "block" }}
          >
            <defs>
              <marker
                id="arrow-red"
                viewBox="0 0 12 12"
                refX="10"
                refY="6"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 12 6 L 0 12 z" fill="#d93025" />
              </marker>
              <marker
                id="arrow-blue"
                viewBox="0 0 12 12"
                refX="10"
                refY="6"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 12 6 L 0 12 z" fill="#1a73e8" />
              </marker>
              <marker
                id="arrow-green"
                viewBox="0 0 12 12"
                refX="10"
                refY="6"
                markerWidth="12"
                markerHeight="12"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 12 6 L 0 12 z" fill="#188038" />
              </marker>
            </defs>

            <g>
              <line
                x1="80"
                y1="80"
                x2={INFLOW.cx - 20}
                y2={INFLOW.cy - INFLOW.r + 20}
                stroke="#188038"
                strokeWidth="6"
                markerEnd="url(#arrow-green)"
              />
            </g>

            <g>
              <circle
                cx={INFLOW.cx}
                cy={INFLOW.cy}
                r={INFLOW.r}
                fill="#1e8e3e"
                stroke="#0f5a26"
                strokeWidth="3"
              />
              <text
                x={INFLOW.cx}
                y={INFLOW.cy - 40}
                fill="white"
                fontSize="26"
                fontWeight="700"
                textAnchor="middle"
              >
                INFLOW
              </text>
              <rect
                x={INFLOW.cx - 90}
                y={INFLOW.cy - 15}
                width="180"
                height="50"
                rx="4"
                fill="white"
                stroke="#0f5a26"
                strokeWidth="2"
              />
              <text
                x={INFLOW.cx}
                y={INFLOW.cy + 18}
                fill="#0f5a26"
                fontSize="24"
                fontWeight="700"
                textAnchor="middle"
              >
                {formatCurrency(report.monthly_inflow)}
              </text>
              <text
                x={INFLOW.cx}
                y={INFLOW.cy + INFLOW.r - 10}
                fill="white"
                fontSize="14"
                textAnchor="middle"
              >
                $1,000 Floor
              </text>
            </g>

            <g>
              <circle
                cx={OUTFLOW.cx}
                cy={OUTFLOW.cy}
                r={OUTFLOW.r}
                fill="#d93025"
                stroke="#8b1b14"
                strokeWidth="3"
              />
              <text
                x={OUTFLOW.cx}
                y={OUTFLOW.cy - 40}
                fill="white"
                fontSize="26"
                fontWeight="700"
                textAnchor="middle"
              >
                OUTFLOW
              </text>
              <rect
                x={OUTFLOW.cx - 90}
                y={OUTFLOW.cy - 15}
                width="180"
                height="50"
                rx="4"
                fill="white"
                stroke="#8b1b14"
                strokeWidth="2"
              />
              <text
                x={OUTFLOW.cx}
                y={OUTFLOW.cy + 18}
                fill="#8b1b14"
                fontSize="24"
                fontWeight="700"
                textAnchor="middle"
              >
                {formatCurrency(report.monthly_outflow)}
              </text>
              <text
                x={OUTFLOW.cx}
                y={OUTFLOW.cy + OUTFLOW.r - 10}
                fill="white"
                fontSize="14"
                textAnchor="middle"
              >
                $1,000 Floor
              </text>
            </g>

            <g>
              <line
                x1={INFLOW.cx + INFLOW.r}
                y1={INFLOW.cy}
                x2={OUTFLOW.cx - OUTFLOW.r - 4}
                y2={OUTFLOW.cy}
                stroke="#d93025"
                strokeWidth="4"
                markerEnd="url(#arrow-red)"
              />
              <rect
                x={(INFLOW.cx + OUTFLOW.cx) / 2 - 90}
                y={INFLOW.cy - 60}
                width="180"
                height="36"
                rx="4"
                fill="white"
                stroke="#d93025"
                strokeWidth="1.5"
              />
              <text
                x={(INFLOW.cx + OUTFLOW.cx) / 2}
                y={INFLOW.cy - 36}
                fill="#d93025"
                fontSize="14"
                fontWeight="700"
                textAnchor="middle"
              >
                {inflowArrowLabel}
              </text>
              <text
                x={(INFLOW.cx + OUTFLOW.cx) / 2}
                y={INFLOW.cy + 38}
                fill="#d93025"
                fontSize="13"
                textAnchor="middle"
              >
                Automated transfer on the 28th
              </text>
            </g>

            <g>
              <path
                d={`M ${INFLOW.cx - 30} ${INFLOW.cy + INFLOW.r - 10} Q ${INFLOW.cx - 40} ${(INFLOW.cy + RESERVE.cy) / 2 + 20} ${RESERVE.cx - RESERVE.r - 6} ${RESERVE.cy}`}
                fill="none"
                stroke="#1a73e8"
                strokeWidth="4"
                markerEnd="url(#arrow-blue)"
              />
              <rect
                x={INFLOW.cx - 80}
                y={(INFLOW.cy + RESERVE.cy) / 2 + 40}
                width="160"
                height="34"
                rx="4"
                fill="white"
                stroke="#1a73e8"
                strokeWidth="1.5"
              />
              <text
                x={INFLOW.cx}
                y={(INFLOW.cy + RESERVE.cy) / 2 + 62}
                fill="#1a73e8"
                fontSize="14"
                fontWeight="700"
                textAnchor="middle"
              >
                {reserveArrowLabel}
              </text>
            </g>

            <g>
              <circle
                cx={RESERVE.cx}
                cy={RESERVE.cy}
                r={RESERVE.r}
                fill="#1a73e8"
                stroke="#0d47a1"
                strokeWidth="3"
              />
              <text
                x={RESERVE.cx}
                y={RESERVE.cy - 30}
                fill="white"
                fontSize="22"
                fontWeight="700"
                textAnchor="middle"
              >
                PRIVATE
              </text>
              <text
                x={RESERVE.cx}
                y={RESERVE.cy - 4}
                fill="white"
                fontSize="22"
                fontWeight="700"
                textAnchor="middle"
              >
                RESERVE
              </text>
              <text
                x={RESERVE.cx}
                y={RESERVE.cy + 30}
                fill="white"
                fontSize="20"
                fontWeight="700"
                textAnchor="middle"
              >
                {formatCurrency(report.monthly_private_reserve)}
              </text>
              <g
                transform={`translate(${RESERVE.cx - 24} ${RESERVE.cy + 50}) scale(2)`}
              >
                <path d={SAVINGS_ROUNDED_PATH} fill="#fa8072" />
              </g>
            </g>
          </svg>

          <Box
            sx={{
              position: "absolute",
              top: 16,
              left: 16,
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
              bgcolor: "rgba(255,255,255,0.9)",
              p: 1.5,
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
              maxWidth: 220,
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <AttachMoneyRoundedIcon sx={{ color: "#188038" }} />
              <Typography variant="subtitle2" fontWeight={700}>
                Monthly income
              </Typography>
            </Stack>
            {report.clients.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                No clients on file.
              </Typography>
            ) : (
              report.clients.map((client) => (
                <Typography
                  key={client.client_id}
                  variant="caption"
                  color="text.primary"
                >
                  {formatCurrency(client.monthly_salary)} — {client.client_name}
                </Typography>
              ))
            )}
          </Box>

          <Box
            sx={{
              position: "absolute",
              top: 16,
              right: 16,
              display: "flex",
              alignItems: "center",
              gap: 1,
              bgcolor: "rgba(255,255,255,0.9)",
              p: 1.25,
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <ReceiptLongRoundedIcon sx={{ color: "#5f6368" }} />
            <Stack>
              <Typography variant="caption" color="text.secondary">
                X = Monthly
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Expenses
              </Typography>
            </Stack>
          </Box>
        </Box>
      </Paper>
    </Stack>
  );
}
