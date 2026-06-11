import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthContext.jsx";
import { config } from "../../app/config.js";

const menus = {
	creator: [
		["Dashboard", "/creator/dashboard", "fa-solid fa-gauge-high"],
		["Events", "/creator/events", "fa-solid fa-calendar-days"],
		["Wallet", "/creator/wallet", "fa-solid fa-wallet"],
		["Subscription", "/creator/subscription", "fa-solid fa-crown"],
	],
	company: [
		["Dashboard", "/company/dashboard", "fa-solid fa-chart-line"],
		["Ads", "/company/ads", "fa-solid fa-rectangle-ad"],
		["Wallet", "/company/wallet", "fa-solid fa-wallet"],
	],
	admin: [
		["Dashboard", "/admin/dashboard", "fa-solid fa-gauge"],
		["Users", "/admin/users", "fa-solid fa-users"],
		["Ads", "/admin/ads", "fa-solid fa-rectangle-ad"],
		["Revenue", "/admin/revenue", "fa-solid fa-sack-dollar"],
		["Settings", "/admin/settings", "fa-solid fa-sliders"],
		[
			"Wallet Actions",
			"/admin/wallet-actions",
			"fa-solid fa-money-bill-transfer",
		],
	],
};

export default function DashboardLayout({
	title,
	subtitle,
	actions,
	children,
}) {
	const { user, logout } = useAuth();
	const items = menus[user?.role] || [];
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const location = useLocation();

	useEffect(() => {
		setIsSidebarOpen(false);
	}, [location.pathname]);

	const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

	return (
		<div className="dashboard-shell">
			{/* Desktop Sidebar */}
			<aside className="sidebar hidden md:flex">
				<div className="sidebar-brand">
					<i className="fa-solid fa-video" /> <span>{config.appName}</span>
				</div>
				<nav>
					{items.map(([label, to, icon]) => (
						<NavLink
							key={to}
							to={to}
							className={({ isActive }) => (isActive ? "active" : "")}>
							<i className={icon} /> <span>{label}</span>
						</NavLink>
					))}
				</nav>
				<button className="sidebar-logout" onClick={logout}>
					<i className="fa-solid fa-arrow-right-from-bracket" /> Logout
				</button>
			</aside>

			<section className="dashboard-main relative">
				<header className="dashboard-topbar">
					<div className="flex items-center gap-4">
						<button
							className="md:hidden text-white hover:text-gray-300 p-1"
							onClick={toggleSidebar}>
							<i className="fa-solid fa-bars text-xl" />
						</button>
						<div>
							<h1>{title}</h1>
							{subtitle && <p>{subtitle}</p>}
						</div>
					</div>
					<div className="topbar-actions">
						{actions}
						<div className="user-pill">
							<i className="fa-regular fa-user" />{" "}
							<span>{user?.name}</span>
							<small>{user?.role}</small>
						</div>
					</div>
				</header>

				{/* Mobile Sidebar Overlay */}
				{isSidebarOpen && (
					<div className="md:hidden fixed inset-0 z-50 bg-black/80 flex">
						<div className="w-64 bg-[#0c0c0d] h-full flex flex-col p-6 border-r border-white/10">
							<div className="flex justify-between items-center mb-8 text-white font-extrabold text-lg">
								<div className="flex items-center gap-3">
									<i className="fa-solid fa-video text-[var(--primary-2)]" />
									<span>{config.appName}</span>
								</div>
								<button
									onClick={toggleSidebar}
									className="text-gray-400 hover:text-white p-2">
									<i className="fa-solid fa-xmark text-xl" />
								</button>
							</div>

							<nav className="flex flex-col gap-2 flex-1">
								{items.map(([label, to, icon]) => (
									<NavLink
										key={to}
										to={to}
										className={({ isActive }) =>
											`flex items-center gap-3 p-3 rounded-xl transition-colors ${isActive ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"}`
										}>
										<i className={icon} /> <span>{label}</span>
									</NavLink>
								))}
							</nav>

							<button
								className="mt-auto flex items-center gap-3 p-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors w-full"
								onClick={logout}>
								<i className="fa-solid fa-arrow-right-from-bracket" />{" "}
								Logout
							</button>
						</div>
						<div className="flex-1" onClick={toggleSidebar} />
					</div>
				)}

				<div className="dashboard-content">{children}</div>
			</section>
		</div>
	);
}
