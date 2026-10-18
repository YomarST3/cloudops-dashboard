# CloudOps Dashboard ☁️🚀

**CloudOps Dashboard** es una aplicación web profesional de nivel empresarial desarrollada con **React, TypeScript y Tailwind CSS**, orientada a la planificación, visualización, modelado de costos y análisis arquitectónico de soluciones en la nube basadas en los conceptos y buenas prácticas de **Amazon Web Services (AWS)** y el **AWS Well-Architected Framework**.

> [!NOTE]
> **Simulación Académica**: Esta aplicación es un simulador frontend de alta fidelidad. No provisiona infraestructura real de pago ni usa credenciales de una cuenta de AWS.
>
> Parte de los datos sí viene en vivo de endpoints **públicos** de AWS a través de las serverless functions de `api/` (Price List API, Service Health, tabla regional de servicios e IP ranges). El resto de catálogos —telemetría, postura de seguridad, topología de red— son seeds estáticos en `src/data/`. Los datos que crea el usuario se guardan en **Supabase**.

---

## 📋 Índice
1. [Objetivos del Proyecto](#-objetivos-del-proyecto)
2. [Stack Tecnológico](#-stack-tecnológico)
3. [Estructura del Proyecto](#-estructura-del-proyecto)
4. [Instalación y Ejecución](#-instalación-y-ejecución)
5. [Módulos y Rutas de la Aplicación](#-módulos-y-rutas-de-la-aplicación)
6. [Conceptos de AWS Representados](#-conceptos-de-aws-representados)
7. [Características Adicionales (Retos Cumplidos)](#-características-adicionales-retos-cumplidos)

> Los datos en vivo de AWS y la configuración de Supabase están cubiertos en
> [Instalación y Ejecución](#-instalación-y-ejecución).

---

## 🎯 Objetivos del Proyecto

* **Planificar y registrar** propuestas de arquitectura Cloud con requerimientos de negocio, disponibilidad y dimensionamiento de usuarios.
* **Modelar la economía Cloud** mediante una calculadora reactiva de costos mensuales y anuales (`costo anual = costo mensual × 12`), con gráficos de distribución por servicio y categoría.
* **Visualizar la infraestructura global** de AWS en 5 regiones estratégicas (`us-east-1`, `us-west-2`, `eu-west-1`, `sa-east-1`, `ap-southeast-1`), midiendo latencias y zonas de disponibilidad (AZs).
* **Auditar la seguridad y el modelo de responsabilidad compartida**, evaluando la gobernanza de IAM, políticas de contraseñas, cifrado KMS, MFA y marcos de cumplimiento normativo (SOC 2, ISO 27001, HIPAA).
* **Representar visualmente la topología de red VPC** mediante un diagrama interactivo construido con componentes React nativos (Internet → Route 53 → CloudFront → VPC → Subred Pública con EC2/NAT → Subred Privada con RDS).

---

## 🛠️ Stack Tecnológico

| Tecnología | Versión / Utilidad |
|---|---|
| **React 19** | Biblioteca principal de interfaz declarativa y reactiva |
| **TypeScript** | Tipado estático estricto para modelos de dominio Cloud |
| **Vite 6** | Entorno de desarrollo rápido y empaquetador ultraligero |
| **Tailwind CSS v3** | Sistema de diseño empresarial utilitario con soporte para Dark Mode |
| **React Router v7** | Enrutamiento declarativo SPA para las 7 vistas principales |
| **Lucide React** | Iconografía técnica para servicios AWS y elementos de red |
| **Recharts** | Biblioteca de visualización de datos para gráficos interactivos (PieChart y BarChart) |
| **Supabase** | Auth (email/password) y PostgreSQL para persistir propuestas, costos, análisis y preferencias |
| **jsPDF + jspdf-autotable** | Reporte PDF del analizador, cargado en un chunk aparte bajo demanda |
| **Vercel Functions** | Serverless en `api/` que consultan endpoints públicos de AWS sin credenciales |
| **Local Storage API** | Caché offline y modo degradado cuando Supabase no está configurado |

### Paleta de Colores Corporativa
* **Fondo Principal**: `#F8FAFC` (Slate-50) / `#0B1120` (Dark Mode)
* **Sidebar**: `#0F172A` (Slate-900)
* **Color Principal**: `#2563EB` (Blue-600)
* **Seguridad**: `#16A34A` (Green-600)
* **Costos**: `#F59E0B` (Amber-500)
* **Alertas**: `#DC2626` (Red-600)
* **Texto Principal**: `#1E293B` (Slate-800) / `#F1F5F9` (Dark Mode)
* **Texto Secundario**: `#64748B` (Slate-500) / `#94A3B8` (Dark Mode)
* **Bordes**: `#E2E8F0` (Slate-200) / `#334155` (Dark Mode)
* **Cards**: `#FFFFFF` / `#1E293B` (Dark Mode)

---

## 📁 Estructura del Proyecto

```text
cloudops-dashboard/
├── index.html
├── package.json
├── server.mjs                 # Servidor de produccion portable (SPA + /api/*)
├── Dockerfile                 # Build y runtime para contenedores
├── docker-compose.yml
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.app.json
├── vite.config.ts
├── vite-plugin-api-dev.ts       # Ejecuta las funciones de api/ durante `vite dev`
├── vercel.json
├── .env.example                 # Plantilla de variables de Supabase
├── README.md
│
├── api/                         # Serverless functions (se despliegan en Vercel)
│   ├── aws-pricing.ts           # AWS Price List API (precios por región)
│   ├── aws-health.ts            # AWS Service Health (estado y eventos)
│   ├── aws-services.ts          # Tabla regional de servicios disponibles
│   ├── aws-ipranges.ts          # Rangos de IP publicados por AWS
│   └── ai-analyze.ts            # Análisis estático de seguridad por regex/CWE
│
├── supabase/
│   ├── config.toml
│   ├── schema.sql               # Dump consolidado para pegar en el SQL Editor
│   └── migrations/
│       └── 20261012000000_cloudops_init.sql
│
└── src/
    ├── main.tsx                  # Punto de entrada de la aplicación
    ├── App.tsx                   # Enrutamiento React Router, guard de sesión y Layout
    ├── index.css                 # Directivas Tailwind, animaciones y scrollbars
    ├── vite-env.d.ts             # Tipado de las variables VITE_*
    │
    ├── types/
    │   └── cloud.ts              # Interfaces TypeScript de servicios, regiones, costos y red
    │
    ├── integrations/
    │   └── supabase/
    │       ├── client.ts         # Singleton perezoso del cliente de Supabase
    │       └── types.ts          # Tipo `Database` generado desde el esquema
    │
    ├── hooks/
    │   └── useAuth.tsx           # Contexto de sesión: signIn, signUp, signOut, reset
    │
    ├── lib/
    │   ├── awsApi.ts             # Cliente HTTP de /api/* con caché TTL
    │   ├── geo.ts                # Haversine y estimación de latencia
    │   ├── liveMetrics.ts        # Puntaje de seguridad derivado de datos en vivo
    │   ├── pdf-report.ts         # Reporte PDF del analizador (jsPDF + autoTable)
    │   ├── analysis-pricing.ts   # Precio efectivo de los servicios: fuente única
    │   └── supabase-helpers.ts   # Alias de filas y mappers BD ↔ dominio
    │
    ├── data/
    │   ├── awsServices.ts        # Catálogo detallado de servicios AWS
    │   ├── regions.ts            # Regiones globales, latencias y AZs
    │   ├── costs.ts              # Dataset inicial de costos y presupuestos
    │   ├── monitoring.ts         # Series de telemetría y alertas de referencia
    │   ├── security.ts           # Modelo de Responsabilidad, IAM y cumplimiento
    │   ├── reports.ts            # Pilares de carga, historial y cumplimiento
    │   ├── networkTopology.ts    # Nodos y conexiones de la arquitectura VPC
    │   ├── worldPaths.ts         # Geometría del mapa mundial (generada)
    │   ├── userOrigin.ts         # Origen del mapa y capitales de referencia
    │   └── proposals.ts          # Propuestas arquitectónicas precargadas
    │
    ├── context/
    │   └── CloudContext.tsx      # Estado global, persistencia, toasts y modo oscuro
    │
    ├── components/
    │   ├── Header.tsx            # Barra superior, selector global de región y tema
    │   ├── Sidebar.tsx           # Menú lateral #0F172A con badges de estado y móvil
    │   ├── UserMenu.tsx          # Menú de usuario, estado de sincronización y logout
    │   ├── StatCard.tsx          # Tarjetas KPI con variantes de color semánticas
    │   ├── ServiceCard.tsx       # Fichas de catálogo con categorías y acciones
    │   ├── CostCard.tsx          # Tarjeta resumen de economía y recomendaciones
    │   ├── SecurityCard.tsx      # Tarjeta de postura y progreso de seguridad
    │   ├── RegionCard.tsx        # Ficha de región con selector activo y latencias
    │   ├── StatusBadge.tsx       # Insignias de estado (Correcto, Revisión, Problema)
    │   ├── ToastContainer.tsx    # Sistema reactivo de alertas flotantes
    │   ├── ServiceDetailModal.tsx # Modal de inspección técnica profunda de servicios
    │   └── NetworkNodeModal.tsx  # Inspector de puertos, CIDR y reglas de red
    │
    └── pages/
        ├── Login.tsx             # Acceso y registro con email/password
        ├── Dashboard.tsx         # Pantalla ejecutiva KPI y flujo de arquitectura
        ├── Planning.tsx          # Formulario de planificación y registro de soluciones
        ├── Costs.tsx             # Calculadora de costos con tablas y gráficos Recharts
        ├── Infrastructure.tsx    # Mapa y comparador de regiones AWS globales
        ├── Security.tsx          # Responsabilidad compartida, IAM y gobernanza
        ├── Network.tsx           # Diagrama visual interactivo de topología de red
        ├── Services.tsx          # Buscador y catálogo de servicios con filtros
        ├── Monitoring.tsx        # Telemetría de referencia y estado de servicios
        ├── Reports.tsx           # Pilares de carga, cumplimiento e historial
        └── ProjectAnalyzer.tsx   # Analizador de seguridad de código fuente
```

---

## ⚡ Instalación y Ejecución

### Prerrequisitos
* Node.js v18.0 o superior (verificado con Node v22.20.0).
* Gestor de paquetes `npm` (o `yarn` / `pnpm`).
* Un proyecto en [supabase.com](https://supabase.com) (el plan gratuito sirve).

### Configuración de Supabase

1. **Crear el proyecto** en supabase.com y esperar a que termine de aprovisionarse.

2. **Crear el esquema.** Elige una de las dos:
   * Pegar `supabase/schema.sql` completo en el **SQL Editor** del dashboard.
   * O linkear el proyecto y usar la CLI:
     ```bash
     supabase link --project-ref <tu-project-ref>
     supabase db push
     ```
   Esto crea `profiles`, `proposals`, `cost_items`, `project_analyses` y `user_preferences`, con RLS activado y políticas que limitan cada fila a su propio `auth.uid()`. **No hay permisos para el rol `anon`.**

3. **Desactivar la confirmación de email**: *Authentication → Providers → Email → Confirm email*, para poder registrarse sin buzón real.

4. **Copiar las variables de entorno**:
   ```bash
   cp .env.example .env
   ```
   Rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con los valores de *Project Settings → API*.

   Solo se usa la **publishable key**: va expuesta en el bundle del navegador y la seguridad la garantiza RLS, no la clave.

### Pasos

1. **Navegar a la carpeta del proyecto**:
   ```bash
   cd cloudops-dashboard
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Iniciar el servidor de desarrollo local**:
   ```bash
   npm run dev
   ```
   Abre tu navegador en la URL indicada por Vite (habitualmente `http://localhost:5173`), crea una cuenta y entra al dashboard.

4. **Compilar para producción (Build)**:
   ```bash
   npm run build
   ```

### Modo local sin Supabase

Si no hay `.env`, el dashboard arranca igual en **modo local**: guarda todo en `localStorage` y lo muestra en el menú de usuario. Sirve para explorar la interfaz sin credenciales, pero nada se comparte entre dispositivos.

### Configuración de la revisión con IA (opcional)

El analizador de proyectos funciona sin esto. Para añadir la segunda capa con Gemini:

1. Crea una clave en **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)** (cuenta de Google, **sin tarjeta**).
2. Copia la clave (empieza por `AIza`) en tu `.env`:
   ```bash
   GEMINI_API_KEY=AIza...
   GEMINI_MODEL=gemini-3.5-flash-lite
   ```
3. En **Vercel**, añádela también en *Project Settings → Environment Variables* como variable **normal** (no le pongas el prefijo `VITE_`, o acabaría en el bundle del navegador y cualquiera podría verla).

Después, marca la casilla **"Revisar también con IA"** en el analizador. Viene **desactivada** a propósito: cada análisis consume requests del límite diario gratuito.

> [!TIP]
> En local la clave se lee con `process.loadEnvFile()`, disponible en Node 20.12+, así que no hace falta ninguna dependencia extra. Si no hay `.env` (Vercel, Docker) se ignora sin error, porque ahí la variable ya viene en `process.env`.

### Despliegue en Vercel

Añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en *Project Settings → Environment Variables*. Vite las incrusta en tiempo de build, así que hay que **re-desplegar** tras cambiarlas. Las funciones de `api/` se despliegan automáticamente.

---

## 🐳 Despliegue en contenedores y Node

> [!IMPORTANT]
> **Los archivos de `api/` solo los ejecuta el runtime de Vercel.** En cualquier otro host (contenedor, nginx, Apache, servidor estático) la carpeta `api/` no hace nada: no es código que se ejecute, son funciones serverless.
>
> Sin ellas, `/api/analizar` cae en la regla de fallback de la SPA y devuelve el `index.html`. El navegador recibe HTML donde esperaba JSON y falla con `Unexpected token '<', "<!doctype"... is not valid JSON`.

`server.mjs` resuelve eso: sirve la SPA **y** ejecuta los handlers de `api/` en el mismo proceso. Sin dependencias externas, solo `node:http`.

```bash
npm ci
npm run build
npm start            # node server.mjs
```

Variables opcionales: `PORT` (3000) y `HOST` (`0.0.0.0`).

**Requiere Node 22.18 o superior**, que es cuando el type stripping de `.ts` se volvió estable. Es lo que permite importar `api/*.ts` directamente, sin paso de compilación.

### Con Docker

```bash
cp .env.example .env      # rellena las dos variables
docker compose up -d --build
```

O manualmente:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
  -t cloudops-dashboard .
docker run -d -p 3000:3000 --name cloudops-dashboard cloudops-dashboard
```

Las dos variables son **build args**, no variables de runtime: Vite las incrusta en el bundle durante el build. Cambiarlas exige reconstruir la imagen.

> Si tu contenedor ya corre nginx/apache sirviendo `dist/`, sustituye ese servidor por `node server.mjs`: las rutas `/api/*` dejan de pasar por el fallback de la SPA y se ejecutan de verdad.

### Los tres entornos

| Entorno | Quién ejecuta `api/` | Cómo |
|---|---|---|
| Vercel | El runtime de Vercel | Despliegue automático, no interviene `server.mjs` |
| `npm run dev` | `vite-plugin-api-dev.ts` | Carga los handlers con `ssrLoadModule` |
| Contenedor / Node | `server.mjs` | `npm start` |

---

## 🗺️ Módulos y Rutas de la Aplicación

### 1. Dashboard (`/dashboard`)
* Tarjetas KPI reutilizables: Servicios utilizados (7), Región seleccionada (`us-east-1`), Costo mensual estimado (\$255), Costo anual proyectado (\$3,060), Recursos Cloud (12) y Estado de Arquitectura (Operacional).
* Mini-diagrama de flujo visual: **Internet → Route 53 → CloudFront → VPC → EC2 / RDS** con semáforos activos.
* Gráfico circular interactivo de distribución porcentual de costos con **Recharts**.
* Resumen de postura de seguridad con indicadores semánticos (Verde, Amarillo, Rojo).

### 2. Planificación Cloud (`/planning`)
* Formulario empresarial para registrar propuestas de arquitectura:
  * Nombre de la solución y tipo de aplicación (Web, Empresarial, API, E-commerce, Móvil, Gestión).
  * Descripción detallada y objetivo de migración.
  * Región seleccionada, estimación de usuarios y nivel de disponibilidad (Básica, Media, Alta).
  * Selección de servicios Cloud (`EC2`, `S3`, `RDS`, `IAM`, `VPC`, `Route 53`, `CloudFront`).
* Validación visual de formularios en tiempo real.
* Panel de propuestas guardadas con persistencia en **Supabase** y opción de eliminación.

### 3. Costos y Economía Cloud (`/costs`)
* Calculadora de recursos donde registrar: servicio, cantidad, horas/mes (720 hrs base), costo unitario, costo mensual y costo anual.
* Cálculo automático: `Costo Anual = Costo Mensual × 12`.
* Tabla interactiva con controles para incrementar/decrementar cantidades y eliminar filas.
* Gráficos interactivos de distribución por servicio (PieChart) y por categoría (BarChart) con Recharts.
* Recomendaciones de optimización (Savings Plans e Instancias Reservadas).

### 4. Infraestructura Global (`/infrastructure`)
* Catálogo de regiones AWS (`us-east-1`, `us-west-2`, `eu-west-1`, `sa-east-1`, `ap-southeast-1`).
* Selector interactivo de región activa que sincroniza el contexto en todo el dashboard.
* Indicadores de latencia en milisegundos, número de Zonas de Disponibilidad (AZs) y estado operativo (*Online*, *Warning*, *Offline*).
* Explicación conceptual de Regiones vs. Zonas de Disponibilidad vs. Puntos Edge.

### 5. Seguridad y Gobernanza (`/security`)
* **Modelo de Responsabilidad Compartida**: Matriz comparativa interactiva entre lo que AWS administra (Seguridad *DE* la nube: data centers, hardware, cables submarinos, hipervisores) y lo que el cliente configura (Seguridad *EN* la nube: datos, identidades, permisos IAM, reglas de firewall).
* **IAM Deep Dive**: Usuarios (100% MFA), roles de instancias temporales, políticas JSON de menor privilegio y cuenta raíz deshabilitada.
* **Protección de Cuenta y Datos**: Cifrado AES-256 en reposo (AWS KMS), TLS 1.3 en tránsito, snapshots automatizados y bloqueo de acceso público en S3 (*S3 Block Public Access*).
* **Cumplimiento Normativo**: Marcos SOC 2 Type II, ISO/IEC 27001 y preparación HIPAA/GDPR.

### 6. Arquitectura de Red y Topología VPC (`/network`)
* **Diagrama visual 100% construido con componentes React** (sin imágenes estáticas).
* Jerarquía visual completa:
  * **Internet**: Clientes globales externos (`0.0.0.0/0`).
  * **Route 53**: Resolución DNS y registros Alias (Puerto 53).
  * **CloudFront CDN**: Red perimetral Edge con caché y AWS WAF (Puerto 443 HTTPS).
  * **Amazon VPC**: Red virtual aislada (`10.0.0.0/16`) con Internet Gateway adjunto.
  * **Subred Pública**: Rango `10.0.1.0/24` con Auto-Scaling Group de instancias **EC2** y **NAT Gateway**.
  * **Subred Privada**: Rango `10.0.2.0/24` aislado para la base de datos **RDS PostgreSQL Multi-AZ** (Puerto 5432).
* Conectores y animación de paquetes de red en tiempo real con botón de pausa/reanudación.
* Inspector interactivo que abre la ficha técnica de cualquier nodo al hacer clic.
* Leyenda completa de red y seguridad.

### 7. Servicios AWS (`/services`)
* Catálogo detallado de los servicios requeridos (EC2, S3, RDS, IAM, VPC, Route 53, CloudFront) más servicios complementarios (Lambda, DynamoDB, CloudWatch).
* Buscador de texto reactivo por nombre, sigla o función operativa.
* Filtros por categoría de servicio (*Compute, Storage, Database, Security, Networking, Content Delivery, Monitoring*).
* Filtros por estado de utilización (*En uso, Disponible, No utilizado*).
* Modal de especificaciones técnicas completas con capacidades clave y modelo de facturación.

### 8. Monitoreo (`/monitoring`)
* Series temporales de CPU, memoria, peticiones y errores. La serie de CPU/memoria es **telemetría de referencia** generada en el navegador; el estado de cada servicio sí viene en vivo de AWS Service Health.
* Estado operativo por servicio, con indicadores *Online*, *Degradado* y *Problema*.
* Feed de alertas de eventos Cloud.

### 9. Reportes (`/reports`)
* Pilares de carga de trabajo del AWS Well-Architected Framework con puntaje de adherencia.
* Historial evolutivo del puntaje de arquitectura y barras de cumplimiento por marco normativo.

### 10. Analizador de Proyectos (`/project-analyzer`)
* Analiza código fuente o una descripción funcional y devuelve hallazgos de seguridad.
* El motor (`api/ai-analyze.ts`) es **análisis estático por patrones y CWE** (no es un modelo de lenguaje): secretos embebidos, inyección SQL, XSS, CORS abierto, validación de entorno y más.
* Al subir un ZIP o archivos, el lenguaje se deduce de la **extensión** de cada archivo (no de regex sobre el texto) y el framework se detecta por imports (`React`, `Next.js`, `Vue`, `Node.js/Express`, `FastAPI`...). Los archivos se agrupan en **módulos por carpeta real** (`src/routes`, `components/ui`), no por cortes de líneas.
* Se excluyen directorios de build (`.output`, `dist`, `.wrangler`, `coverage`…) y el envío prioriza `src/` con un límite de 200 KB por archivo y 400 KB en total.
* Puntaje de seguridad 0-100, desglose por módulo, servicios AWS recomendados con costo estimado y botón para importarlos a la calculadora de costos.
* **Cada hallazgo se puede señalar en el código**: muestra el archivo real y la línea (`src/components/ui/chart.tsx:73`), no solo la carpeta. Los módulos se construyen pegando varios archivos, así que se guarda un índice de qué archivo ocupa qué rango de líneas para poder traducir la posición de un match a `archivo:línea`. Si el análisis viene de Gemini, se intenta extraer la ubicación que el modelo devuelve dentro de su texto.
* **El puntaje enseña su cuenta**: la tarjeta *Cómo se calculó el puntaje* y la sección equivalente del PDF enseñan el `100 − 25 − 15 = 60` completo, con el hallazgo que provoca cada resta.
* **Recomendaciones separadas de vulnerabilidades.** `Gestión de Dependencias` (salta con cualquier `import`), `Variables de Entorno sin Validación` y `Sin Rate Limiting` no son fallos de seguridad: son buenos prácticas. Antes contaban como hallazgos y penalizaban el puntaje, con lo que hasta un Express de 5 líneas correcto salía con 80 puntos. Ahora se muestran en su propio bloque, **no restan** y no suman al contador de vulnerabilidades.
* **El cumplimiento son seis controles con nombre**, no un porcentaje opaco. Antes era `100 menos diez por cada categoría de vulnerabilidad`, lo que no significaba nada (un proyecto con veinte inyecciones SQL puntuaba mejor que uno con tres problemas distintos). Ahora se evalúan **Autenticación, Autorización, Gestión de secretos, Criptografía, Transporte y Validación de entrada**, y cada uno explica en una frase por qué pasa o por qué falla, citando `archivo:línea` cuando el fallo está localizado.
* **El regex detecta, el contexto afina.** Un patrón necesariamente amplio se completa con una comprobación sobre la línea real donde casó, para distinguir un fallo de un consejo. Sin esto, un proyecto real daba falsos positivos **localizables**, que es peor que uno invisible: `authPassword: "Contraseña"` en un diccionario i18n se reportaba como credencial crítica, y un `Math.random()` que elegía el ancho de un esqueleto de carga se reportaba como criptografía rota. Ahora un valor solo cuenta como secreto si parece una credencial (lleva dígitos, símbolos o es largo) o si el archivo no es un diccionario de traducciones, y `Math.random()` solo penaliza si la línea habla de `token`, `session`, `secret`, `nonce`, `jwt` o parecido. **Nada se oculta**: los dos casos siguen apareciendo en pantalla y en el PDF con su archivo y su línea, solo dejan de bajar el puntaje.
* El último análisis se guarda en Supabase por usuario.
* Botón **"Descargar PDF"** que genera el reporte del análisis y lo abre en una pestaña nueva: portada con metadatos, resumen ejecutivo, distribución por severidad, inventario de hallazgos, detalle por módulo con la recomendación de remediación de cada hallazgo, e infraestructura AWS recomendada con costos estimados. jsPDF se carga por `import()` dinámico, así que no engorda el bundle inicial.
* **Precios consistentes en las tres superficies**: el analizador, el PDF y la calculadora de costos resuelven el importe de cada servicio con `src/lib/analysis-pricing.ts`. Si hay precio real de AWS (Price List API, para s3, cloudfront, route53, lambda, rds y ec2) ese gana; si no, se usa el estimado del analizador. Cada cifra se rotula como `AWS live` o `Estimado`, y el PDF declara la región de los precios.

#### Segunda capa: revisión con IA (Gemini)

* El análisis por patrones **sigue siendo la base y siempre se ejecuta**. Esta capa es opcional y aditiva: sin clave, sin cuota o si el modelo falla, el analizador funciona exactamente igual que antes.
* Con `GEMINI_API_KEY` configurada, `api/ai-review.ts` revisa **el mismo proyecto módulo a módulo** con Gemini y fusiona los hallazgos con los del regex, marcados con una etiqueta **IA** (en pantalla y en el PDF, con el sufijo `[IA]`).
* Hay **un solo puntaje**: al fusionar se recalculan el score de cada módulo, el global, el compliance y los contadores. Los hallazgos de la IA entran en ese cálculo igual que los regex.
* Ambos endpoints usan el **mismo troceado de módulos** (`api/_modules.ts`) y la **misma fórmula de puntaje** (`api/_analyze.ts`). Sin eso, los hallazgos de la IA acabarían adjudicados a carpetas distintas de las que usa el regex.
* Van en endpoints separados por un motivo concreto: una función serverless de Vercel dura 60 s y aquí se hacen hasta 15 llamadas al modelo (una por módulo). Si compartieran endpoint, al agotarse el tiempo se perdería también el análisis estático.
* Es **gratis**: `gemini-3.5-flash-lite` da 500 requests/día en el plan gratuito, y el máximo por análisis son 15 (uno por módulo). `GEMINI_MODEL` permite cambiar a `gemini-3.8-flash` (más preciso, 20/día) sin tocar código. No se instala ningún SDK: se usa `fetch` nativo.
* A tener en cuenta: en el plan gratuito **Google usa el código enviado para entrenar sus modelos**. Para proyectos propios o de clase no hay problema, pero con código de cliente real conviene revisar esta política.

### Acceso (`/login`)
* Registro e inicio de sesión con email y contraseña gestionados por Supabase Auth.
* Recuperación de contraseña por correo y cierre de sesión desde el menú del Header.

---

## 🏛️ Conceptos de AWS Representados

1. **Computación en la Nube**: Elasticidad, escalado bajo demanda y pago por uso (*Pay-as-you-go*).
2. **Servicios Core de AWS**: EC2 (IaaS), S3 (Object Storage), RDS (Managed Database), IAM (Security & Identity), VPC (Software-Defined Networking), Route 53 (DNS Anycast) y CloudFront (CDN Edge).
3. **Economía Cloud**: Modelo TCO (Total Cost of Ownership), estimación mensual/anual y optimización con instancias reservadas.
4. **Infraestructura Global**: Regiones geográficas, Zonas de Disponibilidad independientes (AZs) y Puntos de Presencia Edge (PoPs).
5. **Modelo de Responsabilidad Compartida**: Demarcación de responsabilidades entre el proveedor Cloud y el cliente.
6. **Seguridad y Menor Privilegio**: Políticas de acceso basadas en identidad y recursos, MFA obligatorio y KMS.
7. **Arquitectura de Red Segura**: Segmentación mediante subredes públicas (DMZ con IGW) y privadas (DB protegida con acceso outbound vía NAT Gateway), tablas de ruteo y Security Groups con inspección de estado (*stateful*).

---

## 🌟 Características Adicionales (Retos Cumplidos)

* 🌓 **Modo Oscuro Completo**: Conmutador Dark/Light mode persistido en Supabase (con `localStorage` como respaldo) y adaptación en todos los componentes y gráficos.
* 🔎 **Buscador y Filtros Combinados**: Búsqueda en tiempo real y filtrado multidimensional en el catálogo de servicios y regiones.
* 📊 **Gráficos Interactivos**: Gráficos de pastel y barras con Tooltips formateados en USD mediante Recharts.
* 🌐 **Selector Global de Región**: Permite cambiar la región activa desde el Header o la vista de infraestructura, impactando las métricas en todo el sistema.
* 🔔 **Sistema de Notificaciones Toast**: Alertas dinámicas al guardar propuestas, añadir servicios o alternar regiones.
* 💾 **Persistencia Multiusuario en Supabase**: Cada cuenta guarda sus propuestas, costos, análisis y preferencias, aislada por RLS (`auth.uid() = user_id`). Sin credenciales de AWS, solo la publishable key. Si Supabase no responde, la app degrada a `localStorage` sin romper.
* 📡 **Datos en Vivo de AWS**: Precios (Price List API), estado de servicios (Service Health), disponibilidad regional e IP ranges consultados vía serverless functions, sin credenciales.
* 📄 **Reporte PDF del Analizador**: Documento A4 con portada, resumen ejecutivo, tablas de hallazgos, detalle por módulo con remediación y presupuesto AWS estimado, con pie de página numerado.
* 📱 **Diseño 100% Responsive**: Experiencia optimizada para pantallas móviles, tablets, laptops y monitores ultraanchos con menú lateral colapsable.
