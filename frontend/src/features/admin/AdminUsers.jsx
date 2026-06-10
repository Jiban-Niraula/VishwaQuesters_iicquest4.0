import { useEffect, useState } from 'react';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import Badge from '../../shared/components/Badge.jsx';
import EmptyState from '../../shared/components/EmptyState.jsx';
import { adminApi } from '../../shared/api/admin.js';
import { money, dateTime } from '../../shared/utils/format.js';

export default function AdminUsers() {
  const [role, setRole] = useState('');
  const [users, setUsers] = useState([]);

  async function load(r = role) {
    const data = await adminApi.users(r || undefined);
    setUsers(data.users || []);
  }

  useEffect(() => { load(''); }, []);

  return (
    <DashboardLayout title="Users" subtitle="Manage creators, companies, and admin accounts.">
      <Card
        title="User List"
        icon="fa-solid fa-users"
        action={
          <select
            value={role}
            onChange={(e) => { setRole(e.target.value); load(e.target.value); }}
            style={{ width: 'auto' }}
          >
            <option value="">All roles</option>
            <option value="creator">Creators</option>
            <option value="company">Companies</option>
            <option value="admin">Admins</option>
          </select>
        }
      >
        {users.length === 0
          ? <EmptyState title="No users found" />
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Wallet</th>
                    <th>Subscription</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        <small>{u.email}</small>
                      </td>
                      <td>
                        <Badge tone={u.role === 'admin' ? 'danger' : u.role === 'company' ? 'warning' : 'success'}>
                          {u.role}
                        </Badge>
                      </td>
                      <td>{money(u.wallet?.balance, u.wallet?.currency)}</td>
                      <td>{u.subscription?.plan ? <Badge tone={u.subscription.plan === 'pro' ? 'warning' : 'neutral'}>{u.subscription.plan}</Badge> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                      <td><small>{dateTime(u.createdAt)}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </DashboardLayout>
  );
}
