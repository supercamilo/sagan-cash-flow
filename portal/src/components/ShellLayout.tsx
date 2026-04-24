import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import HomeWorkOutlinedIcon from "@mui/icons-material/HomeWorkOutlined";
import {
  AppBar,
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import { NavLink } from "react-router-dom";
import type { PropsWithChildren } from "react";

const drawerWidth = 240;

const navItems = [
  {
    label: "Clients",
    path: "/clients",
    icon: <GroupOutlinedIcon />,
  },
  {
    label: "Balance Snapshots",
    path: "/balance-snapshots",
    icon: <AssessmentOutlinedIcon />,
  },
];

export default function ShellLayout({ children }: PropsWithChildren) {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          left: { sm: `${drawerWidth}px` },
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(10px)",
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <HomeWorkOutlinedIcon color="primary" />
          <Box>
            <Typography variant="h6" color="text.primary">
              Sagan Portal
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Household income, balances, and reporting
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: "border-box",
            borderRight: "1px solid rgba(31, 78, 95, 0.12)",
            background:
              "linear-gradient(180deg, rgba(31,78,95,0.08) 0%, rgba(183,121,31,0.06) 100%)",
          },
        }}
      >
        <Toolbar />
        <Box sx={{ p: 2 }}>
          <Typography variant="overline" color="text.secondary">
            Navigation
          </Typography>
          <List sx={{ mt: 1, display: "grid", gap: 1 }}>
            {navItems.map((item) => (
              <ListItemButton
                key={item.path}
                component={NavLink}
                to={item.path}
                sx={{
                  borderRadius: 3,
                  color: "text.primary",
                  "&.active": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    "& .MuiListItemIcon-root": {
                      color: "primary.contrastText",
                    },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 4 }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
