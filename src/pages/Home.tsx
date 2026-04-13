import { useState, useMemo, useCallback } from "react";
import { collection, addDoc, serverTimestamp, getDocs } from "firebase/firestore";
import emailjs from "@emailjs/browser";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.png";
import "./Home.css";

const FESTIVOS = new Set([
  "2026-01-01","2026-01-12","2026-03-23","2026-03-29","2026-03-30",
  "2026-04-02","2026-04-03","2026-05-18","2026-06-08","2026-06-15",
  "2026-06-29","2026-07-20","2026-08-07","2026-08-17","2026-10-12",
  "2026-11-02","2026-11-16","2026-12-08","2026-12-25",
  "2025-01-01","2025-01-06","2025-03-24","2025-04-17","2025-04-18",
  "2025-05-01","2025-06-02","2025-06-23","2025-06-30","2025-07-20",
  "2025-08-07","2025-08-18","2025-10-13","2025-11-03","2025-11-17",
  "2025-12-08","2025-12-25",
  "2027-01-01","2027-01-11","2027-03-22","2027-03-25","2027-03-26",
  "2027-05-01","2027-05-17","2027-06-07","2027-06-14","2027-06-28",
  "2027-07-20","2027-08-07","2027-08-16","2027-10-18","2027-11-01",
  "2027-11-15","2027-12-08","2027-12-25",
]);

const esDiaNoHabil = (f: string) => {
  if (!f) return false;
  const [y, m, d] = f.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === 0 || FESTIVOS.has(f);
};

const SALAS_MEET: Record<string, string> = {
  "juridico1@centrojuridicointernacional.com": "https://meet.google.com/epq-zijv-mow",
  "juridico2@centrojuridicointernacional.com": "https://meet.google.com/wsd-gxyo-bgw",
  "juridico3@centrojuridicointernacional.com": "https://meet.google.com/jmo-fbbm-qkc",
  "juridico4@centrojuridicointernacional.com": "https://meet.google.com/fsz-hear-vvj",
  "juridico5@centrojuridicointernacional.com": "https://meet.google.com/dkz-qqgp-yfn",
  "juridico6@centrojuridicointernacional.com": "https://meet.google.com/ffj-vkyx-zqc",
  "juridico7@centrojuridicointernacional.com": "https://meet.google.com/zja-awqc-ait",
  "juridico8@centrojuridicointernacional.com": "https://meet.google.com/zhq-paem-akq",
  "juridico9@centrojuridicointernacional.com": "https://meet.google.com/drx-qcsw-vai",
  "juridico10@centrojuridicointernacional.com": "https://meet.google.com/qkn-okxs-znw",
  "juridico11@centrojuridicointernacional.com": "https://meet.google.com/wzp-uzdi-fdk",
  "juridico12@centrojuridicointernacional.com": "https://meet.google.com/qro-zjhi-vgt",
  "juridico13@centrojuridicointernacional.com": "https://meet.google.com/dqu-wfwm-pjv",
  "juridico14@centrojuridicointernacional.com": "https://meet.google.com/eff-cpvb-oas",
  "juridico15@centrojuridicointernacional.com": "https://meet.google.com/kci-mtaa-vyy",
  "juridico16@centrojuridicointernacional.com": "https://meet.google.com/aim-xybm-mpe",
  "juridico17@centrojuridicointernacional.com": "https://meet.google.com/mdh-cegn-pzj",
  "juridico18@centrojuridicointernacional.com": "https://meet.google.com/kyt-tbov-jdi",
  "juridico19@centrojuridicointernacional.com": "https://meet.google.com/eep-qsyu-qeq",
  "juridico20@centrojuridicointernacional.com": "https://meet.google.com/gqm-vqda-ijh",
  "juridico21@centrojuridicointernacional.com": "https://meet.google.com/tfz-hybs-rrk",
  "juridico22@centrojuridicointernacional.com": "https://meet.google.com/pbd-cjuv-oag",
  "juridico23@centrojuridicointernacional.com": "https://meet.google.com/wou-oodu-nen",
  "juridico24@centrojuridicointernacional.com": "https://meet.google.com/zsd-bgdb-tzm",
  "juridico25@centrojuridicointernacional.com": "https://meet.google.com/mpn-aptm-toc",
  "juridico26@centrojuridicointernacional.com": "https://meet.google.com/ack-vbaq-wqj",
  "juridico27@centrojuridicointernacional.com": "https://meet.google.com/fqj-yqth-eka",
  "juridico28@centrojuridicointernacional.com": "https://meet.google.com/niq-yezn-swm",
  "juridico29@centrojuridicointernacional.com": "https://meet.google.com/kbn-pgqz-ayp",
  "juridico30@centrojuridicointernacional.com": "https://meet.google.com/xie-ibyi-qfb",
  "juridico31@centrojuridicointernacional.com": "https://meet.google.com/fmo-awei-jxm",
  "juridico32@centrojuridicointernacional.com": "https://meet.google.com/wzh-hcuf-jrz",
  "juridico33@centrojuridicointernacional.com": "https://meet.google.com/bfq-swqw-azo",
  "juridico34@centrojuridicointernacional.com": "https://meet.google.com/zgj-bijq-qdp",
  "juridico35@centrojuridicointernacional.com": "https://meet.google.com/hgs-fxdz-cxj",
  "juridico36@centrojuridicointernacional.com": "https://meet.google.com/tzz-dfwa-woc",
  "juridico37@centrojuridicointernacional.com": "https://meet.google.com/jvh-ppyf-ehc",
  "juridico38@centrojuridicointernacional.com": "https://meet.google.com/iiv-udtd-off",
  "juridico39@centrojuridicointernacional.com": "https://meet.google.com/wkn-thhk-qwa",
  "juridico40@centrojuridicointernacional.com": "https://meet.google.com/xop-rjkz-hju",
  "juridico41@centrojuridicointernacional.com": "https://meet.google.com/bmv-ajss-waa",
  "juridico42@centrojuridicointernacional.com": "https://meet.google.com/ayx-jges-dze",
  "juridico43@centrojuridicointernacional.com": "https://meet.google.com/cdi-gahj-snb",
  "juridico44@centrojuridicointernacional.com": "https://meet.google.com/cmc-sznz-htq",
  "juridico45@centrojuridicointernacional.com": "https://meet.google.com/cfw-fcmr-xhp",
  "juridico46@centrojuridicointernacional.com": "https://meet.google.com/xym-xiay-hry",
  "juridico47@centrojuridicointernacional.com": "https://meet.google.com/nsf-cvpn-vjg",
  "juridico48@centrojuridicointernacional.com": "https://meet.google.com/uej-zzya-izn",
  "juridico49@centrojuridicointernacional.com": "https://meet.google.com/ipo-rpec-dod",
  "juridico50@centrojuridicointernacional.com": "https://meet.google.com/zwe-kfjr-rjn",
  "juridico51@centrojuridicointernacional.com": "https://meet.google.com/shw-vhjc-jfx",
  "juridico52@centrojuridicointernacional.com": "https://meet.google.com/eos-vfme-xpc",
  "juridico53@centrojuridicointernacional.com": "https://meet.google.com/pmt-thpg-bij",
  "juridico54@centrojuridicointernacional.com": "https://meet.google.com/fpr-oiys-sgd",
  "juridico55@centrojuridicointernacional.com": "https://meet.google.com/zav-krib-vba",
  "juridico56@centrojuridicointernacional.com": "https://meet.google.com/gya-wtjq-xff",
  "juridico57@centrojuridicointernacional.com": "https://meet.google.com/jnx-tiim-kax",
  "juridico58@centrojuridicointernacional.com": "https://meet.google.com/ssv-zvat-zjd",
  "juridico59@centrojuridicointernacional.com": "https://meet.google.com/tzq-simw-yow",
};

const CAPACITACIONES = [
  "ELABORACIÓN REGLAMENTO INTERNO DE TRABAJO",
  "ACTUALIZACIÓN REGLAMENTO INTERNO DE TRABAJO",
  "POLÍTICA DE PROTECCIÓN DE DATOS ELABORACIÓN",
  "ELABORACIÓN POLÍTICA DE DESCONEXIÓN LABORAL",
  "MANUAL OBLIGATORIO EMPRESARIAL DE TÉRMINOS Y CONDICIONES",
  "POLÍTICA DE REGLAMENTACIÓN DE MODALIDADES LABORALES NO PRESENCIALES",
  "POLÍTICA DE PREVENCIÓN Y ATENCIÓN DE LA DISCRIMINACIÓN Y ACOSO EN EL AMBIENTE LABORAL",
  "POLÍTICA DE PERMISOS LICENCIAS E INCAPACIDADES",
  "POLÍTICA DE PREVENCIÓN DEL ACOSO SEXUAL EN EL AMBIENTE LABORAL",
  "POLÍTICA DE COMISIONES Y BONIFICACIONES",
  "POLÍTICA DE MEDIOS TECNOLÓGICOS",
];

interface FormData {
  nombre: string;
  correo: string;
  nit: string;
  fecha: string;
  hora: string;
  capacitacion: string;
}

const EMPTY: FormData = { nombre: "", correo: "", nit: "", fecha: "", hora: "", capacitacion: "" };

const Home = () => {
  const { user } = useAuth();
  const defaultLinkMeet = useMemo(() => SALAS_MEET[user?.email?.toLowerCase() ?? ""] ?? "", [user]);
  const [customLink, setCustomLink] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState(false);
  const linkMeet = customLink ?? defaultLinkMeet;
  const [form, setForm] = useState<FormData>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<Partial<FormData>>({});

  const validate = (): boolean => {
    const e: Partial<FormData> = {};
    if (!form.nombre.trim()) e.nombre = "El nombre es requerido.";
    if (!form.correo.trim()) e.correo = "El correo es requerido.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo)) e.correo = "Correo invalido.";
    if (!form.nit.trim()) e.nit = "El NIT es requerido.";
    if (!form.fecha) e.fecha = "La fecha es requerida.";
    else if (esDiaNoHabil(form.fecha)) e.fecha = "Domingos y festivos no disponibles.";
    if (!form.hora) e.hora = "La hora es requerida.";
    if (!form.capacitacion) e.capacitacion = "Seleccione una capacitacion.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = ev.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (name === "fecha" && value && esDiaNoHabil(value)) {
      setErrors((p) => ({ ...p, fecha: "Domingos y festivos no disponibles." }));
    } else if (errors[name as keyof FormData]) {
      setErrors((p) => ({ ...p, [name]: undefined }));
    }
  };

  const checkDisponible = useCallback(async (): Promise<boolean> => {
    if (!linkMeet || !form.fecha || !form.hora) return true;
    try {
      const snap = await getDocs(collection(db, "capacitaciones"));
      return !snap.docs.some((d) => {
        const x = d.data();
        return x.linkMeet === linkMeet && x.fecha === form.fecha && x.hora === form.hora;
      });
    } catch { return true; }
  }, [linkMeet, form.fecha, form.hora]);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setMsg(null);

    try {
      const ok = await checkDisponible();
      if (!ok) {
        setMsg({ type: "error", text: "Ya existe una capacitacion en esta fecha y hora con tu sala. Selecciona otro horario." });
        setSaving(false);
        return;
      }

      await addDoc(collection(db, "capacitaciones"), {
        ...form, linkMeet,
        userId: user?.uid ?? null,
        userEmail: user?.email ?? null,
        creadoEn: serverTimestamp(),
      });

      await emailjs.send(
        import.meta.env.VITE_EMAILJS_SERVICE_ID,
        import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
        {
          to_email: form.correo, empresa: form.nombre, nit: form.nit,
          capacitacion: form.capacitacion, fecha: form.fecha, hora: form.hora,
          link_meet: linkMeet,
        },
        import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
      );

      setMsg({ type: "success", text: "Solicitud enviada con exito. El correo fue enviado al cliente." });
      setForm({ ...EMPTY });
      setErrors({});
      setCustomLink(null);
      setEditingLink(false);
      setTimeout(() => setMsg(null), 8000);
    } catch (err) {
      console.error(err);
      setMsg({ type: "error", text: "Error al enviar. Intente de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="home-page">
      <div className="form-card">
        <div className="form-card-header">
          <img src={logo} alt="" className="form-logo" />
          <div>
            <h1>Solicitud de Capacitacion</h1>
            <p>Complete los datos para registrar la capacitacion empresarial.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-body">
            <div className="form-group form-full">
              <label htmlFor="capacitacion">Tipo de capacitacion</label>
              <select id="capacitacion" name="capacitacion" value={form.capacitacion} onChange={handleChange} className={errors.capacitacion ? "input-error" : ""}>
                <option value="">-- Seleccione una capacitacion --</option>
                {CAPACITACIONES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="error-msg">{errors.capacitacion ?? "\u00A0"}</span>
            </div>

            <div className="form-group">
              <label htmlFor="nombre">Nombre de empresa</label>
              <input id="nombre" name="nombre" type="text" placeholder="Nombre de la empresa" value={form.nombre} onChange={handleChange} className={errors.nombre ? "input-error" : ""} />
              <span className="error-msg">{errors.nombre ?? "\u00A0"}</span>
            </div>
            <div className="form-group">
              <label htmlFor="nit">NIT de empresa</label>
              <input id="nit" name="nit" type="text" placeholder="NIT de la empresa" value={form.nit} onChange={handleChange} className={errors.nit ? "input-error" : ""} />
              <span className="error-msg">{errors.nit ?? "\u00A0"}</span>
            </div>
            <div className="form-group form-full">
              <label htmlFor="correo">Correo electronico del cliente</label>
              <input id="correo" name="correo" type="email" placeholder="ejemplo@empresa.com" value={form.correo} onChange={handleChange} className={errors.correo ? "input-error" : ""} />
              <span className="error-msg">{errors.correo ?? "\u00A0"}</span>
            </div>

            <div className="form-group">
              <label htmlFor="fecha">Fecha</label>
              <input id="fecha" name="fecha" type="date" value={form.fecha} min={new Date().toISOString().split("T")[0]} onChange={handleChange} className={errors.fecha ? "input-error" : ""} />
              <span className="error-msg">{errors.fecha ?? "\u00A0"}</span>
            </div>
            <div className="form-group">
              <label htmlFor="hora">Hora</label>
              <select id="hora" name="hora" value={form.hora} onChange={handleChange} className={errors.hora ? "input-error" : ""}>
                <option value="">-- Seleccione la hora --</option>
                <option value="08:00">8:00 AM</option>
                <option value="08:30">8:30 AM</option>
                <option value="09:00">9:00 AM</option>
                <option value="09:30">9:30 AM</option>
                <option value="10:00">10:00 AM</option>
                <option value="10:30">10:30 AM</option>
                <option value="11:00">11:00 AM</option>
                <option value="11:30">11:30 AM</option>
                <option value="12:00">12:00 PM</option>
                <option value="12:30">12:30 PM</option>
                <option value="13:00">1:00 PM</option>
                <option value="13:30">1:30 PM</option>
                <option value="14:00">2:00 PM</option>
                <option value="14:30">2:30 PM</option>
                <option value="15:00">3:00 PM</option>
                <option value="15:30">3:30 PM</option>
                <option value="16:00">4:00 PM</option>
              </select>
              <span className="error-msg">{errors.hora ?? "\u00A0"}</span>
            </div>

            <div className="meet-badge form-full">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 10l5-3v10l-5-3z"/><rect x="1" y="6" width="14" height="12" rx="2" ry="2"/></svg>
              <div className="meet-badge-content">
                <span className="meet-label">Sala de Meet asignada</span>
                {editingLink ? (
                  <input
                    type="url"
                    className="meet-link-input"
                    value={customLink ?? ""}
                    placeholder="https://meet.google.com/..."
                    onChange={(e) => setCustomLink(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <a href={linkMeet || "#"} target="_blank" rel="noopener noreferrer">{linkMeet || "No asignada"}</a>
                )}
              </div>
              <div className="meet-badge-actions">
                {editingLink ? (
                  <>
                    {customLink !== null && customLink !== defaultLinkMeet && (
                      <button
                        type="button"
                        className="meet-link-btn meet-link-btn-reset"
                        onClick={() => setCustomLink(defaultLinkMeet)}
                      >
                        Restaurar
                      </button>
                    )}
                    <button
                      type="button"
                      className="meet-link-btn"
                      onClick={() => setEditingLink(false)}
                    >
                      Listo
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="meet-link-btn"
                    onClick={() => {
                      setCustomLink(linkMeet);
                      setEditingLink(true);
                    }}
                  >
                    Editar
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className={msg ? (msg.type === "success" ? "submit-success" : "submit-error") : "submit-msg-hidden"}>
            {msg?.text ?? "\u00A0"}
          </div>

          <button type="submit" className="btn-primary btn-submit" disabled={saving}>
            {saving ? "Enviando..." : "Enviar solicitud"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Home;
