import React, { useEffect, useState } from 'react';
import { Package, ShoppingCart, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import useAutoRefresh from '../hooks/useAutoRefresh';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';

const COLORS = ['#22c55e', '#f59e0b', '#ef4444'];

function StatCard({ title, value, sub, icon: Icon, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`h-12 w-12 ${colors[color]} rounded-xl flex items-center justify-center`}>
            <Icon size={22} className="text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = () => {
    api.get('/sales/dashboard-stats').then(({ data }) => {
      setStats(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchStats(); }, []);
  useAutoRefresh(fetchStats, 30000);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Spinner size="lg" />
    </div>
  );

  if (!stats) return (
    <div className="text-center text-gray-500 py-20">Failed to load dashboard data.</div>
  );

  const pieData = [
    { name: 'In Stock', value: stats.stockHealth.inStock },
    { name: 'Low Stock', value: stats.stockHealth.lowStock },
    { name: 'Out of Stock', value: stats.stockHealth.outOfStock },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Real-time inventory & sales overview</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Products" value={stats.totalProducts} icon={Package} color="blue" />
        <StatCard
          title="Today's Sales"
          value={stats.todaySalesCount}
          sub={`Store: ${stats.todayStoreSales?.count ?? 0} · Web: ${stats.todayWebOrders?.count ?? 0}`}
          icon={ShoppingCart}
          color="green"
        />
        <StatCard
          title="Today's Revenue"
          value={`₹${(stats.todayRevenue || 0).toFixed(2)}`}
          sub={
            stats.todayRefundTotal > 0
              ? `Store: ₹${(stats.todayStoreSales?.revenue ?? 0).toFixed(2)} · Web: ₹${(stats.todayWebOrders?.revenue ?? 0).toFixed(2)} · Refunds: -₹${stats.todayRefundTotal.toFixed(2)}`
              : `Store: ₹${(stats.todayStoreSales?.revenue ?? 0).toFixed(2)} · Web: ₹${(stats.todayWebOrders?.revenue ?? 0).toFixed(2)}`
          }
          icon={TrendingUp}
          color="blue"
        />
        <StatCard
          title="Low Stock Alerts"
          value={stats.lowStockCount}
          sub="items need restocking"
          icon={AlertTriangle}
          color="yellow"
        />
      </div>

      {/* Charts + Recent Transactions */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Stock Health Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stock Health</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1 text-xs">
                  <div className="h-2 w-2 rounded-full" style={{ background: COLORS[i] }} />
                  <span className="text-gray-600">{d.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Transactions</CardTitle>
              <Link to="/sales" className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                View all <ArrowRight size={12} />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {stats.recentSales.length === 0 ? (
              <div className="text-center text-gray-400 py-8 text-sm">No transactions yet</div>
            ) : (
              <div className="divide-y">
                {stats.recentSales.map((sale) => (
                  <div key={sale._id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-medium">{sale.transactionId}</div>
                      <div className="text-xs text-gray-500">
                        {sale.channel === 'WEB' ? (sale.customer?.name || 'Web Customer') : (sale.soldBy?.name || 'Staff')} · {new Date(sale.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={sale.channel === 'STORE' ? 'info' : 'secondary'}>
                        {sale.channel}
                      </Badge>
                      <span className="text-sm font-semibold">₹{sale.totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alert */}
      {stats.lowStockCount > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-yellow-600" />
                <div>
                  <p className="font-medium text-yellow-800">{stats.lowStockCount} items are running low on stock</p>
                  <p className="text-xs text-yellow-600">Check inventory and restock soon</p>
                </div>
              </div>
              <Link to="/inventory" className="text-sm text-yellow-700 font-medium underline">
                View low stock
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
