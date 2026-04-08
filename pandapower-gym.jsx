import { useState, useEffect, useCallback } from "react";

const SLOTS = Array.from({ length: 13 }, (_, i) => {
  const h = i + 8;
  return { id: i, start: h, label: `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"} - ${h + 1 > 12 ? h + 1 - 12 : h + 1}:00 ${h + 1 >= 12 ? "PM" : "AM"}` };
});
const DAYS_LABEL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAYS_FULL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MAX_PER_SLOT = 6;
const ADMIN_EMAIL = "admin@pandapower.com";
const ADMIN_PASS = "admin123";

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDateLocal(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function getDayOfWeek(dateStr) {
  return parseDateLocal(dateStr).getDay();
}
function getWeekDates(monday) {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return formatDate(d);
  });
}
function isSameWeek(d1, d2) {
  return formatDate(getMonday(d1)) === formatDate(getMonday(d2));
}

export default function PandaPowerGym() {
  const [users, setUsers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState("login");
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [adminTab, setAdminTab] = useState("bookings");
  const [editingUser, setEditingUser] = useState(null);
  const [selectedSlotInfo, setSelectedSlotInfo] = useState(null);

  const showToast = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Storage
  const loadData = useCallback(async () => {
    try {
      const [uRes, bRes] = await Promise.all([
        window.storage.get("pp-users").catch(() => null),
        window.storage.get("pp-bookings").catch(() => null),
      ]);
      if (uRes?.value) setUsers(JSON.parse(uRes.value));
      if (bRes?.value) setBookings(JSON.parse(bRes.value));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const saveUsers = async (u) => {
    setUsers(u);
    try { await window.storage.set("pp-users", JSON.stringify(u)); } catch (e) { console.error(e); }
  };
  const saveBookings = async (b) => {
    setBookings(b);
    try { await window.storage.set("pp-bookings", JSON.stringify(b)); } catch (e) { console.error(e); }
  };

  // Auth
  const handleRegister = async () => {
    if (!form.name || !form.email || !form.password) return showToast("Completa todos los campos", "error");
    if (form.password.length < 4) return showToast("Contraseña mínimo 4 caracteres", "error");
    if (users.find(u => u.email === form.email.toLowerCase())) return showToast("Email ya registrado", "error");
    const newUser = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: form.name,
      email: form.email.toLowerCase(),
      password: form.password,
      maxHoursPerDay: 1,
      maxDaysPerWeek: 5,
      createdAt: new Date().toISOString(),
    };
    await saveUsers([...users, newUser]);
    setCurrentUser(newUser);
    setView("dashboard");
    setForm({ name: "", email: "", password: "" });
    showToast("¡Cuenta creada exitosamente!", "success");
  };

  const handleLogin = () => {
    if (form.email.toLowerCase() === ADMIN_EMAIL && form.password === ADMIN_PASS) {
      setCurrentUser({ id: "admin", name: "Admin", email: ADMIN_EMAIL, isAdmin: true });
      setView("admin");
      setForm({ name: "", email: "", password: "" });
      return showToast("Bienvenido Admin", "success");
    }
    const user = users.find(u => u.email === form.email.toLowerCase() && u.password === form.password);
    if (!user) return showToast("Credenciales incorrectas", "error");
    setCurrentUser(user);
    setView("dashboard");
    setForm({ name: "", email: "", password: "" });
    showToast(`¡Bienvenido, ${user.name}!`, "success");
  };

  const logout = () => {
    setCurrentUser(null);
    setView("login");
    setForm({ name: "", email: "", password: "" });
  };

  // Booking logic
  const getSlotBookings = (date, slotId) =>
    bookings.filter(b => b.date === date && b.slotId === slotId && b.status === "active");

  const getUserBookingsForDate = (userId, date) =>
    bookings.filter(b => b.userId === userId && b.date === date && b.status === "active");

  const getUserDaysThisWeek = (userId, date) => {
    const monday = getMonday(parseDateLocal(date));
    const weekDates = getWeekDates(monday);
    const bookedDates = new Set();
    bookings.forEach(b => {
      if (b.userId === userId && weekDates.includes(b.date) && (b.status === "active" || b.status === "no-show")) {
        bookedDates.add(b.date);
      }
    });
    return bookedDates.size;
  };

  const canBook = (userId, date, slotId) => {
    const user = users.find(u => u.id === userId);
    if (!user) return { ok: false, reason: "Usuario no encontrado" };
    const dow = getDayOfWeek(date);
    if (dow === 0) return { ok: false, reason: "Domingo cerrado" };
    const slotBookings = getSlotBookings(date, slotId);
    if (slotBookings.length >= MAX_PER_SLOT) return { ok: false, reason: "Cupo lleno" };
    if (slotBookings.find(b => b.userId === userId)) return { ok: false, reason: "Ya reservaste esta hora" };
    const userDayBookings = getUserBookingsForDate(userId, date);
    if (userDayBookings.length >= (user.maxHoursPerDay || 1)) return { ok: false, reason: `Máximo ${user.maxHoursPerDay || 1} hora(s) por día` };
    const daysUsed = getUserDaysThisWeek(userId, date);
    const alreadyHasBookingThisDay = bookings.some(b => b.userId === userId && b.date === date && (b.status === "active" || b.status === "no-show"));
    if (!alreadyHasBookingThisDay && daysUsed >= (user.maxDaysPerWeek || 5)) return { ok: false, reason: `Máximo ${user.maxDaysPerWeek || 5} días por semana` };
    // Check if slot is in the past
    const now = new Date();
    const slotDate = parseDateLocal(date);
    const slot = SLOTS.find(s => s.id === slotId);
    slotDate.setHours(slot.start, 0, 0, 0);
    if (slotDate < now) return { ok: false, reason: "Horario ya pasó" };
    return { ok: true };
  };

  const bookSlot = async (date, slotId) => {
    const check = canBook(currentUser.id, date, slotId);
    if (!check.ok) return showToast(check.reason, "error");
    const newBooking = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: currentUser.id,
      date,
      slotId,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    await saveBookings([...bookings, newBooking]);
    showToast("¡Hora reservada!", "success");
  };

  const canCancel = (booking) => {
    const now = new Date();
    const slot = SLOTS.find(s => s.id === booking.slotId);
    const slotDate = parseDateLocal(booking.date);
    slotDate.setHours(slot.start, 0, 0, 0);
    const diff = slotDate - now;
    return diff >= 2 * 60 * 60 * 1000;
  };

  const cancelBooking = async (bookingId) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;
    if (!canCancel(booking)) return showToast("No puedes cancelar con menos de 2 horas de anticipación", "error");
    const updated = bookings.map(b => b.id === bookingId ? { ...b, status: "cancelled" } : b);
    await saveBookings(updated);
    showToast("Reserva cancelada", "success");
  };

  const markNoShow = async (bookingId) => {
    const updated = bookings.map(b => b.id === bookingId ? { ...b, status: "no-show" } : b);
    await saveBookings(updated);
    showToast("Marcado como no-show", "info");
  };

  const markAttended = async (bookingId) => {
    const updated = bookings.map(b => b.id === bookingId ? { ...b, status: "attended" } : b);
    await saveBookings(updated);
    showToast("Marcado como asistió", "success");
  };

  const updateUserLimits = async (userId, field, value) => {
    const updated = users.map(u => u.id === userId ? { ...u, [field]: Math.max(1, parseInt(value) || 1) } : u);
    await saveUsers(updated);
    showToast("Límites actualizados", "success");
    setEditingUser(null);
  };

  const deleteUser = async (userId) => {
    const updated = users.filter(u => u.id !== userId);
    const updatedBookings = bookings.filter(b => b.userId !== userId);
    await saveUsers(updated);
    await saveBookings(updatedBookings);
    showToast("Usuario eliminado", "info");
  };

  const weekDates = getWeekDates(weekStart);
  const today = formatDate(new Date());

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const thisWeek = () => setWeekStart(getMonday(new Date()));

  // My bookings
  const myActiveBookings = currentUser ? bookings.filter(b => b.userId === currentUser.id && b.status === "active").sort((a, b) => a.date.localeCompare(b.date) || a.slotId - b.slotId) : [];

  if (loading) return (
    <div style={styles.loadingScreen}>
      <div style={styles.pandaIcon}>🐼</div>
      <div style={styles.loadingText}>PandaPower GYM</div>
      <div style={styles.loadingBar}><div style={styles.loadingBarInner} /></div>
    </div>
  );

  // ── AUTH SCREENS ──
  if (view === "login" || view === "register") {
    return (
      <div style={styles.authContainer}>
        <div style={styles.authCard}>
          <div style={styles.authLogo}>
            <span style={styles.pandaEmoji}>🐼</span>
            <h1 style={styles.brandName}>PandaPower</h1>
            <p style={styles.brandSub}>GYM</p>
          </div>
          <div style={styles.authTabs}>
            <button style={view === "login" ? styles.authTabActive : styles.authTab} onClick={() => setView("login")}>Iniciar Sesión</button>
            <button style={view === "register" ? styles.authTabActive : styles.authTab} onClick={() => setView("register")}>Registrarse</button>
          </div>
          {view === "register" && (
            <input style={styles.input} placeholder="Nombre completo" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          )}
          <input style={styles.input} placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input style={styles.input} placeholder="Contraseña" type="password" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            onKeyDown={e => e.key === "Enter" && (view === "login" ? handleLogin() : handleRegister())} />
          <button style={styles.authBtn} onClick={view === "login" ? handleLogin : handleRegister}>
            {view === "login" ? "Entrar" : "Crear Cuenta"}
          </button>
          {view === "login" && (
            <p style={styles.adminHint}>Admin: admin@pandapower.com / admin123</p>
          )}
        </div>
        {toast && <div style={{ ...styles.toast, ...(toast.type === "error" ? styles.toastError : toast.type === "success" ? styles.toastSuccess : {}) }}>{toast.msg}</div>}
      </div>
    );
  }

  // ── USER DASHBOARD ──
  if (view === "dashboard" && currentUser && !currentUser.isAdmin) {
    const user = users.find(u => u.id === currentUser.id) || currentUser;
    const daysUsedThisWeek = getUserDaysThisWeek(user.id, weekDates[0]);
    return (
      <div style={styles.appContainer}>
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerPanda}>🐼</span>
            <span style={styles.headerBrand}>PandaPower GYM</span>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.userName}>{user.name}</span>
            <button style={styles.logoutBtn} onClick={logout}>Salir</button>
          </div>
        </header>

        <div style={styles.statsBar}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Horas/día</span>
            <span style={styles.statValue}>{user.maxHoursPerDay || 1}</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Días/semana</span>
            <span style={styles.statValue}>{daysUsedThisWeek}/{user.maxDaysPerWeek || 5}</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Reservas activas</span>
            <span style={styles.statValue}>{myActiveBookings.length}</span>
          </div>
        </div>

        {/* My bookings */}
        {myActiveBookings.length > 0 && (
          <div style={styles.myBookingsSection}>
            <h3 style={styles.sectionTitle}>Mis Reservas</h3>
            <div style={styles.myBookingsList}>
              {myActiveBookings.map(b => {
                const slot = SLOTS.find(s => s.id === b.slotId);
                const canCx = canCancel(b);
                const dateObj = parseDateLocal(b.date);
                const dayName = DAYS_FULL[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1] || "";
                return (
                  <div key={b.id} style={styles.myBookingCard}>
                    <div>
                      <strong>{dayName} {b.date}</strong>
                      <br />
                      <span style={styles.slotLabel}>{slot?.label}</span>
                    </div>
                    <button style={canCx ? styles.cancelBtn : styles.cancelBtnDisabled} onClick={() => canCx && cancelBooking(b.id)} disabled={!canCx}
                      title={canCx ? "Cancelar reserva" : "No puedes cancelar a menos de 2h"}>
                      {canCx ? "Cancelar" : "🔒 Bloqueada"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Week nav */}
        <div style={styles.weekNav}>
          <button style={styles.weekBtn} onClick={prevWeek}>◀ Anterior</button>
          <button style={styles.weekBtnToday} onClick={thisWeek}>Hoy</button>
          <button style={styles.weekBtn} onClick={nextWeek}>Siguiente ▶</button>
        </div>
        <p style={styles.weekRange}>
          Semana: {weekDates[0]} — {weekDates[5]}
        </p>

        {/* Schedule grid */}
        <div style={styles.gridWrapper}>
          <div style={styles.grid}>
            <div style={styles.gridHeaderCell} />
            {weekDates.map((d, i) => (
              <div key={d} style={{ ...styles.gridHeaderCell, ...(d === today ? styles.gridHeaderToday : {}) }}>
                <span style={styles.gridDayLabel}>{DAYS_LABEL[i]}</span>
                <span style={styles.gridDateLabel}>{d.slice(5)}</span>
              </div>
            ))}
            {SLOTS.map(slot => (
              [
                <div key={`l-${slot.id}`} style={styles.gridTimeCell}>
                  {slot.start > 12 ? slot.start - 12 : slot.start}:00 {slot.start >= 12 ? "PM" : "AM"}
                </div>,
                ...weekDates.map((d, di) => {
                  const slotBks = getSlotBookings(d, slot.id);
                  const remaining = MAX_PER_SLOT - slotBks.length;
                  const myBk = slotBks.find(b => b.userId === currentUser.id);
                  const isPast = (() => {
                    const now = new Date();
                    const sd = parseDateLocal(d);
                    sd.setHours(slot.start, 0, 0, 0);
                    return sd < now;
                  })();
                  const check = canBook(currentUser.id, d, slot.id);
                  let cellStyle = { ...styles.gridCell };
                  if (isPast) cellStyle = { ...cellStyle, ...styles.gridCellPast };
                  else if (myBk) cellStyle = { ...cellStyle, ...styles.gridCellMine };
                  else if (remaining === 0) cellStyle = { ...cellStyle, ...styles.gridCellFull };
                  else if (remaining <= 2) cellStyle = { ...cellStyle, ...styles.gridCellLow };

                  return (
                    <div key={`${d}-${slot.id}`} style={cellStyle}
                      onClick={() => {
                        if (myBk) return;
                        if (isPast) return;
                        if (check.ok) bookSlot(d, slot.id);
                        else showToast(check.reason, "error");
                      }}
                      title={myBk ? "Tu reserva" : check.ok ? "Click para reservar" : check.reason}>
                      {myBk ? (
                        <span style={styles.cellMineText}>✓ Tú</span>
                      ) : (
                        <span style={remaining === 0 ? styles.cellFullText : styles.cellFreeText}>
                          {remaining === 0 ? "Lleno" : `${remaining} libre${remaining > 1 ? "s" : ""}`}
                        </span>
                      )}
                    </div>
                  );
                })
              ]
            )).flat()}
          </div>
        </div>

        <div style={styles.legend}>
          <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#4ade80" }} /> Tu reserva</span>
          <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#334155" }} /> Disponible</span>
          <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#b45309" }} /> Últimos cupos</span>
          <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#7f1d1d" }} /> Lleno</span>
          <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#1e1e1e" }} /> Pasado</span>
        </div>

        {toast && <div style={{ ...styles.toast, ...(toast.type === "error" ? styles.toastError : toast.type === "success" ? styles.toastSuccess : {}) }}>{toast.msg}</div>}
      </div>
    );
  }

  // ── ADMIN DASHBOARD ──
  if (view === "admin" && currentUser?.isAdmin) {
    const weekBookings = bookings.filter(b => weekDates.includes(b.date));
    return (
      <div style={styles.appContainer}>
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerPanda}>🐼</span>
            <span style={styles.headerBrand}>PandaPower ADMIN</span>
          </div>
          <div style={styles.headerRight}>
            <button style={styles.logoutBtn} onClick={logout}>Salir</button>
          </div>
        </header>

        <div style={styles.adminTabs}>
          {["bookings", "users", "schedule"].map(t => (
            <button key={t} style={adminTab === t ? styles.adminTabActive : styles.adminTabBtn}
              onClick={() => setAdminTab(t)}>
              {t === "bookings" ? "📋 Reservas" : t === "users" ? "👥 Usuarios" : "📅 Horario"}
            </button>
          ))}
        </div>

        {adminTab === "schedule" && (
          <div>
            <div style={styles.weekNav}>
              <button style={styles.weekBtn} onClick={prevWeek}>◀</button>
              <button style={styles.weekBtnToday} onClick={thisWeek}>Hoy</button>
              <button style={styles.weekBtn} onClick={nextWeek}>▶</button>
            </div>
            <p style={styles.weekRange}>Semana: {weekDates[0]} — {weekDates[5]}</p>
            <div style={styles.gridWrapper}>
              <div style={styles.grid}>
                <div style={styles.gridHeaderCell} />
                {weekDates.map((d, i) => (
                  <div key={d} style={{ ...styles.gridHeaderCell, ...(d === today ? styles.gridHeaderToday : {}) }}>
                    <span style={styles.gridDayLabel}>{DAYS_LABEL[i]}</span>
                    <span style={styles.gridDateLabel}>{d.slice(5)}</span>
                  </div>
                ))}
                {SLOTS.map(slot => (
                  [
                    <div key={`l-${slot.id}`} style={styles.gridTimeCell}>
                      {slot.start > 12 ? slot.start - 12 : slot.start}:00 {slot.start >= 12 ? "PM" : "AM"}
                    </div>,
                    ...weekDates.map(d => {
                      const slotBks = getSlotBookings(d, slot.id);
                      const remaining = MAX_PER_SLOT - slotBks.length;
                      return (
                        <div key={`${d}-${slot.id}`}
                          style={{ ...styles.gridCell, cursor: "pointer", ...(remaining === 0 ? styles.gridCellFull : remaining <= 2 ? styles.gridCellLow : {}) }}
                          onClick={() => setSelectedSlotInfo({ date: d, slotId: slot.id, bookings: slotBks })}>
                          <span style={styles.cellFreeText}>{slotBks.length}/{MAX_PER_SLOT}</span>
                        </div>
                      );
                    })
                  ]
                )).flat()}
              </div>
            </div>

            {selectedSlotInfo && (
              <div style={styles.modal} onClick={() => setSelectedSlotInfo(null)}>
                <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                  <h3 style={styles.modalTitle}>
                    {DAYS_FULL[parseDateLocal(selectedSlotInfo.date).getDay() - 1]} {selectedSlotInfo.date} — {SLOTS.find(s => s.id === selectedSlotInfo.slotId)?.label}
                  </h3>
                  {selectedSlotInfo.bookings.length === 0 ? (
                    <p style={styles.emptyText}>Sin reservas</p>
                  ) : (
                    <div style={styles.modalList}>
                      {selectedSlotInfo.bookings.map(b => {
                        const u = users.find(x => x.id === b.userId);
                        const isPast = (() => {
                          const now = new Date();
                          const sd = parseDateLocal(b.date);
                          const sl = SLOTS.find(s => s.id === b.slotId);
                          sd.setHours(sl.start + 1, 0, 0, 0);
                          return sd < now;
                        })();
                        return (
                          <div key={b.id} style={styles.modalItem}>
                            <div>
                              <strong>{u?.name || "?"}</strong>
                              <br /><span style={{ fontSize: 12, color: "#94a3b8" }}>{u?.email}</span>
                              {b.status === "no-show" && <span style={styles.noShowBadge}>NO-SHOW</span>}
                              {b.status === "attended" && <span style={styles.attendedBadge}>ASISTIÓ</span>}
                            </div>
                            {isPast && b.status === "active" && (
                              <div style={styles.modalActions}>
                                <button style={styles.attendedBtn} onClick={() => markAttended(b.id)}>✓ Asistió</button>
                                <button style={styles.noShowBtn} onClick={() => markNoShow(b.id)}>✗ No vino</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <button style={styles.closeModalBtn} onClick={() => setSelectedSlotInfo(null)}>Cerrar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {adminTab === "bookings" && (
          <div style={styles.adminSection}>
            <h3 style={styles.sectionTitle}>Reservas de la semana</h3>
            <div style={styles.weekNav}>
              <button style={styles.weekBtn} onClick={prevWeek}>◀</button>
              <button style={styles.weekBtnToday} onClick={thisWeek}>Hoy</button>
              <button style={styles.weekBtn} onClick={nextWeek}>▶</button>
            </div>
            <p style={styles.weekRange}>Semana: {weekDates[0]} — {weekDates[5]}</p>
            {weekDates.map((d, di) => {
              const dayBks = bookings.filter(b => b.date === d && b.status !== "cancelled").sort((a, b) => a.slotId - b.slotId);
              if (dayBks.length === 0) return null;
              return (
                <div key={d} style={styles.daySection}>
                  <h4 style={styles.dayTitle}>{DAYS_FULL[di]} — {d}</h4>
                  {dayBks.map(b => {
                    const u = users.find(x => x.id === b.userId);
                    const sl = SLOTS.find(s => s.id === b.slotId);
                    const isPast = (() => {
                      const now = new Date();
                      const sd = parseDateLocal(b.date);
                      sd.setHours(sl.start + 1, 0, 0, 0);
                      return sd < now;
                    })();
                    return (
                      <div key={b.id} style={styles.bookingRow}>
                        <span style={styles.bookingTime}>{sl?.label}</span>
                        <span style={styles.bookingUser}>{u?.name || "?"}</span>
                        <span style={{
                          ...styles.statusBadge,
                          ...(b.status === "no-show" ? styles.statusNoShow : b.status === "attended" ? styles.statusAttended : styles.statusActive)
                        }}>
                          {b.status === "no-show" ? "NO-SHOW" : b.status === "attended" ? "ASISTIÓ" : "ACTIVA"}
                        </span>
                        {isPast && b.status === "active" && (
                          <>
                            <button style={styles.smallBtn} onClick={() => markAttended(b.id)}>✓</button>
                            <button style={{ ...styles.smallBtn, ...styles.smallBtnDanger }} onClick={() => markNoShow(b.id)}>✗</button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {weekBookings.filter(b => b.status !== "cancelled").length === 0 && (
              <p style={styles.emptyText}>Sin reservas esta semana</p>
            )}
          </div>
        )}

        {adminTab === "users" && (
          <div style={styles.adminSection}>
            <h3 style={styles.sectionTitle}>Usuarios Registrados ({users.length})</h3>
            {users.length === 0 ? (
              <p style={styles.emptyText}>No hay usuarios registrados</p>
            ) : (
              <div style={styles.usersList}>
                {users.map(u => {
                  const totalBookings = bookings.filter(b => b.userId === u.id && b.status === "active").length;
                  const noShows = bookings.filter(b => b.userId === u.id && b.status === "no-show").length;
                  const isEditing = editingUser === u.id;
                  return (
                    <div key={u.id} style={styles.userCard}>
                      <div style={styles.userCardHeader}>
                        <div>
                          <strong style={styles.userCardName}>{u.name}</strong>
                          <span style={styles.userCardEmail}>{u.email}</span>
                        </div>
                        <div style={styles.userCardActions}>
                          <button style={styles.editBtn} onClick={() => setEditingUser(isEditing ? null : u.id)}>
                            {isEditing ? "Cerrar" : "⚙️ Editar"}
                          </button>
                          <button style={styles.deleteBtn} onClick={() => { if (confirm(`¿Eliminar a ${u.name}?`)) deleteUser(u.id); }}>🗑️</button>
                        </div>
                      </div>
                      <div style={styles.userCardStats}>
                        <span>Reservas activas: <strong>{totalBookings}</strong></span>
                        <span>No-shows: <strong style={{ color: noShows > 0 ? "#ef4444" : "#4ade80" }}>{noShows}</strong></span>
                        <span>Hrs/día: <strong>{u.maxHoursPerDay || 1}</strong></span>
                        <span>Días/sem: <strong>{u.maxDaysPerWeek || 5}</strong></span>
                      </div>
                      {isEditing && (
                        <div style={styles.editSection}>
                          <div style={styles.editRow}>
                            <label style={styles.editLabel}>Máx horas/día:</label>
                            <div style={styles.editControls}>
                              {[1, 2, 3].map(n => (
                                <button key={n} style={(u.maxHoursPerDay || 1) === n ? styles.editOptionActive : styles.editOption}
                                  onClick={() => updateUserLimits(u.id, "maxHoursPerDay", n)}>{n}</button>
                              ))}
                            </div>
                          </div>
                          <div style={styles.editRow}>
                            <label style={styles.editLabel}>Máx días/semana:</label>
                            <div style={styles.editControls}>
                              {[1, 2, 3, 4, 5, 6].map(n => (
                                <button key={n} style={(u.maxDaysPerWeek || 5) === n ? styles.editOptionActive : styles.editOption}
                                  onClick={() => updateUserLimits(u.id, "maxDaysPerWeek", n)}>{n}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {toast && <div style={{ ...styles.toast, ...(toast.type === "error" ? styles.toastError : toast.type === "success" ? styles.toastSuccess : {}) }}>{toast.msg}</div>}
      </div>
    );
  }

  return null;
}

// ── STYLES ──
const styles = {
  loadingScreen: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0a0a0a", fontFamily: "'Outfit', sans-serif" },
  pandaIcon: { fontSize: 64, marginBottom: 16, animation: "pulse 1.5s infinite" },
  loadingText: { color: "#e2e8f0", fontSize: 28, fontWeight: 700, letterSpacing: 2 },
  loadingBar: { width: 200, height: 4, background: "#1e293b", borderRadius: 4, marginTop: 24, overflow: "hidden" },
  loadingBarInner: { width: "40%", height: "100%", background: "linear-gradient(90deg, #4ade80, #22d3ee)", borderRadius: 4, animation: "loadBar 1.2s ease-in-out infinite" },

  authContainer: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0a0a0a", fontFamily: "'Outfit', sans-serif", padding: 16 },
  authCard: { background: "#111318", border: "1px solid #1e293b", borderRadius: 20, padding: "40px 32px", width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 14 },
  authLogo: { textAlign: "center", marginBottom: 8 },
  pandaEmoji: { fontSize: 56, display: "block", marginBottom: 8 },
  brandName: { color: "#f1f5f9", fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: 1, fontFamily: "'Outfit', sans-serif" },
  brandSub: { color: "#4ade80", fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: 6, textTransform: "uppercase" },
  authTabs: { display: "flex", gap: 4, background: "#0f1117", borderRadius: 12, padding: 4 },
  authTab: { flex: 1, padding: "10px 0", border: "none", background: "transparent", color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer", borderRadius: 10, fontFamily: "'Outfit', sans-serif" },
  authTabActive: { flex: 1, padding: "10px 0", border: "none", background: "#1e293b", color: "#4ade80", fontSize: 14, fontWeight: 600, cursor: "pointer", borderRadius: 10, fontFamily: "'Outfit', sans-serif" },
  input: { padding: "14px 16px", background: "#0f1117", border: "1px solid #1e293b", borderRadius: 12, color: "#e2e8f0", fontSize: 15, outline: "none", fontFamily: "'Outfit', sans-serif", transition: "border 0.2s" },
  authBtn: { padding: "14px", background: "linear-gradient(135deg, #4ade80, #22d3ee)", border: "none", borderRadius: 12, color: "#0a0a0a", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit', sans-serif", marginTop: 4 },
  adminHint: { color: "#475569", fontSize: 11, textAlign: "center", margin: 0 },

  appContainer: { minHeight: "100vh", background: "#0a0a0a", fontFamily: "'Outfit', sans-serif", color: "#e2e8f0", paddingBottom: 40 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #1e293b", background: "#0f1117" },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  headerPanda: { fontSize: 28 },
  headerBrand: { fontSize: 18, fontWeight: 700, letterSpacing: 1, color: "#f1f5f9" },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  userName: { color: "#4ade80", fontWeight: 600, fontSize: 14 },
  logoutBtn: { padding: "8px 16px", background: "#1e293b", border: "none", borderRadius: 8, color: "#94a3b8", fontSize: 13, cursor: "pointer", fontFamily: "'Outfit', sans-serif" },

  statsBar: { display: "flex", gap: 12, padding: "16px 20px", overflowX: "auto" },
  statItem: { flex: 1, minWidth: 90, background: "#111318", border: "1px solid #1e293b", borderRadius: 14, padding: "14px 16px", textAlign: "center" },
  statLabel: { display: "block", color: "#64748b", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  statValue: { display: "block", color: "#4ade80", fontSize: 24, fontWeight: 800 },

  myBookingsSection: { padding: "0 20px", marginBottom: 8 },
  sectionTitle: { color: "#f1f5f9", fontSize: 16, fontWeight: 700, marginBottom: 12, marginTop: 16 },
  myBookingsList: { display: "flex", flexDirection: "column", gap: 8 },
  myBookingCard: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#111318", border: "1px solid #1e293b", borderRadius: 12, padding: "12px 16px" },
  slotLabel: { color: "#94a3b8", fontSize: 13 },
  cancelBtn: { padding: "8px 16px", background: "#7f1d1d", border: "none", borderRadius: 8, color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Outfit', sans-serif" },
  cancelBtnDisabled: { padding: "8px 16px", background: "#1e293b", border: "none", borderRadius: 8, color: "#475569", fontSize: 13, fontWeight: 600, cursor: "not-allowed", fontFamily: "'Outfit', sans-serif" },

  weekNav: { display: "flex", justifyContent: "center", gap: 8, padding: "16px 20px 4px" },
  weekBtn: { padding: "8px 18px", background: "#1e293b", border: "none", borderRadius: 8, color: "#94a3b8", fontSize: 13, cursor: "pointer", fontFamily: "'Outfit', sans-serif" },
  weekBtnToday: { padding: "8px 18px", background: "#4ade80", border: "none", borderRadius: 8, color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit', sans-serif" },
  weekRange: { textAlign: "center", color: "#64748b", fontSize: 13, margin: "4px 0 12px" },

  gridWrapper: { padding: "0 12px", overflowX: "auto" },
  grid: { display: "grid", gridTemplateColumns: "64px repeat(6, 1fr)", gap: 3, minWidth: 540 },
  gridHeaderCell: { padding: "10px 4px", textAlign: "center", background: "#111318", borderRadius: 8 },
  gridHeaderToday: { background: "#1a2e1a", border: "1px solid #4ade80" },
  gridDayLabel: { display: "block", color: "#94a3b8", fontSize: 12, fontWeight: 700 },
  gridDateLabel: { display: "block", color: "#64748b", fontSize: 11 },
  gridTimeCell: { padding: "8px 4px", textAlign: "right", color: "#64748b", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "flex-end" },
  gridCell: { padding: "8px 4px", textAlign: "center", background: "#151921", borderRadius: 6, cursor: "pointer", transition: "all 0.15s", border: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 36 },
  gridCellPast: { background: "#0a0a0a", opacity: 0.4, cursor: "default" },
  gridCellMine: { background: "#14532d", border: "1px solid #4ade80" },
  gridCellFull: { background: "#1c0a0a", border: "1px solid #7f1d1d" },
  gridCellLow: { background: "#1c1505", border: "1px solid #b45309" },
  cellMineText: { color: "#4ade80", fontSize: 11, fontWeight: 700 },
  cellFreeText: { color: "#94a3b8", fontSize: 10, fontWeight: 600 },
  cellFullText: { color: "#ef4444", fontSize: 10, fontWeight: 700 },

  legend: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, padding: "16px 20px" },
  legendItem: { display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 12 },
  legendDot: { width: 10, height: 10, borderRadius: 3, display: "inline-block" },

  // Admin
  adminTabs: { display: "flex", gap: 4, padding: "12px 16px", background: "#0f1117", borderBottom: "1px solid #1e293b" },
  adminTabBtn: { flex: 1, padding: "10px 0", border: "none", background: "transparent", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 8, fontFamily: "'Outfit', sans-serif" },
  adminTabActive: { flex: 1, padding: "10px 0", border: "none", background: "#1e293b", color: "#4ade80", fontSize: 13, fontWeight: 700, cursor: "pointer", borderRadius: 8, fontFamily: "'Outfit', sans-serif" },
  adminSection: { padding: "0 20px" },

  daySection: { marginBottom: 16 },
  dayTitle: { color: "#94a3b8", fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #1e293b", paddingBottom: 6 },
  bookingRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#111318", borderRadius: 8, marginBottom: 4, flexWrap: "wrap" },
  bookingTime: { color: "#22d3ee", fontSize: 12, fontWeight: 600, minWidth: 140 },
  bookingUser: { color: "#e2e8f0", fontSize: 13, fontWeight: 600, flex: 1 },
  statusBadge: { padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 },
  statusActive: { background: "#14532d", color: "#4ade80" },
  statusNoShow: { background: "#7f1d1d", color: "#fca5a5" },
  statusAttended: { background: "#1e3a5f", color: "#7dd3fc" },
  smallBtn: { padding: "6px 12px", background: "#14532d", border: "none", borderRadius: 6, color: "#4ade80", fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif" },
  smallBtnDanger: { background: "#7f1d1d", color: "#fca5a5" },

  usersList: { display: "flex", flexDirection: "column", gap: 10 },
  userCard: { background: "#111318", border: "1px solid #1e293b", borderRadius: 14, padding: 16, transition: "border 0.2s" },
  userCardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  userCardName: { color: "#f1f5f9", fontSize: 15, display: "block" },
  userCardEmail: { color: "#64748b", fontSize: 12 },
  userCardActions: { display: "flex", gap: 6 },
  editBtn: { padding: "6px 12px", background: "#1e293b", border: "none", borderRadius: 8, color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "'Outfit', sans-serif" },
  deleteBtn: { padding: "6px 10px", background: "#1e293b", border: "none", borderRadius: 8, color: "#ef4444", fontSize: 14, cursor: "pointer" },
  userCardStats: { display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: "#94a3b8" },
  editSection: { marginTop: 12, padding: "12px", background: "#0f1117", borderRadius: 10, display: "flex", flexDirection: "column", gap: 12 },
  editRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  editLabel: { color: "#94a3b8", fontSize: 13, fontWeight: 600, minWidth: 120 },
  editControls: { display: "flex", gap: 6 },
  editOption: { width: 36, height: 36, borderRadius: 8, border: "1px solid #1e293b", background: "#151921", color: "#94a3b8", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit', sans-serif" },
  editOptionActive: { width: 36, height: 36, borderRadius: 8, border: "1px solid #4ade80", background: "#14532d", color: "#4ade80", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit', sans-serif" },

  emptyText: { color: "#475569", fontSize: 14, textAlign: "center", padding: 32 },

  modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modalContent: { background: "#111318", border: "1px solid #1e293b", borderRadius: 20, padding: 24, width: "100%", maxWidth: 480, maxHeight: "80vh", overflow: "auto" },
  modalTitle: { color: "#f1f5f9", fontSize: 16, fontWeight: 700, marginBottom: 16, margin: 0 },
  modalList: { display: "flex", flexDirection: "column", gap: 10, marginTop: 16 },
  modalItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#0f1117", borderRadius: 10, color: "#e2e8f0", flexWrap: "wrap", gap: 8 },
  modalActions: { display: "flex", gap: 6 },
  attendedBtn: { padding: "6px 14px", background: "#14532d", border: "none", borderRadius: 6, color: "#4ade80", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Outfit', sans-serif" },
  noShowBtn: { padding: "6px 14px", background: "#7f1d1d", border: "none", borderRadius: 6, color: "#fca5a5", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Outfit', sans-serif" },
  noShowBadge: { marginLeft: 8, padding: "2px 8px", background: "#7f1d1d", borderRadius: 4, color: "#fca5a5", fontSize: 10, fontWeight: 700 },
  attendedBadge: { marginLeft: 8, padding: "2px 8px", background: "#1e3a5f", borderRadius: 4, color: "#7dd3fc", fontSize: 10, fontWeight: 700 },
  closeModalBtn: { marginTop: 16, width: "100%", padding: "12px", background: "#1e293b", border: "none", borderRadius: 10, color: "#94a3b8", fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif" },

  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", padding: "12px 24px", background: "#1e293b", color: "#e2e8f0", borderRadius: 12, fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", fontFamily: "'Outfit', sans-serif", whiteSpace: "nowrap" },
  toastError: { background: "#7f1d1d", color: "#fca5a5" },
  toastSuccess: { background: "#14532d", color: "#4ade80" },
};
