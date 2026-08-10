/* ============================================================
   009 · Libro de Reclamaciones virtual

   Obligatorio desde el momento en que Maze Tour cobre por un
   servicio (Ley 29571, D.S. 011-2011-PCM y su modificatoria
   D.S. 006-2014-PCM).

   Decisiones de esquema que conviene entender antes de tocar
   esta tabla:

   · "code" usa una SECUENCIA propia, no el id. La norma exige
     numeración correlativa de las hojas; si mañana borras una
     fila el correlativo no debe reutilizarse ni saltar hacia
     atrás. Una secuencia lo garantiza aunque la transacción
     falle.

   · NADA de esta tabla se borra. La norma obliga a conservar
     las hojas 2 años. Por eso no hay ON DELETE CASCADE contra
     Users: una reclamación sobrevive al usuario que la puso.

   · "dueAt" se guarda calculado, no se deriva al leer. El plazo
     legal es de 15 días hábiles desde la presentación; si el
     cálculo viviera en el código, cambiar la función alteraría
     retroactivamente plazos de reclamos ya vencidos.
   ============================================================ */

const sql = `
CREATE SEQUENCE IF NOT EXISTS complaint_code_seq START 1;

CREATE TABLE IF NOT EXISTS "Complaints" (
  "id"              BIGSERIAL PRIMARY KEY,

  -- Correlativo visible: LR-2026-000001
  "code"            VARCHAR(24)  NOT NULL UNIQUE,

  -- 'reclamo' = disconformidad con el servicio
  -- 'queja'   = malestar por la atención recibida
  "kind"            VARCHAR(10)  NOT NULL,

  -- Consumidor
  "fullName"        VARCHAR(180) NOT NULL,
  "documentType"    VARCHAR(20)  NOT NULL,
  "documentNumber"  VARCHAR(20)  NOT NULL,
  "email"           VARCHAR(254) NOT NULL,
  "phone"           VARCHAR(40),
  "address"         VARCHAR(255) NOT NULL,
  "isMinor"         BOOLEAN      NOT NULL DEFAULT FALSE,
  "guardianName"    VARCHAR(180),

  -- Identificación del bien contratado
  "itemType"        VARCHAR(10)  NOT NULL,   -- 'producto' | 'servicio'
  "itemDescription" TEXT         NOT NULL,
  "amountClaimed"   NUMERIC(10,2),
  "currency"        VARCHAR(3)   NOT NULL DEFAULT 'PEN',

  -- Detalle y pedido
  "detail"          TEXT         NOT NULL,
  "request"         TEXT         NOT NULL,

  -- Respuesta del proveedor
  "status"          VARCHAR(20)  NOT NULL DEFAULT 'pending',
  "response"        TEXT,
  "respondedAt"     TIMESTAMPTZ,
  "respondedBy"     VARCHAR(128),

  -- Plazo legal: 15 días hábiles, ampliable 15 más con aviso
  "dueAt"           TIMESTAMPTZ  NOT NULL,
  "extendedUntil"   TIMESTAMPTZ,

  -- Trazabilidad
  "ipAddress"       VARCHAR(64),
  "createdAt"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT complaints_kind_chk   CHECK ("kind" IN ('reclamo', 'queja')),
  CONSTRAINT complaints_item_chk   CHECK ("itemType" IN ('producto', 'servicio')),
  CONSTRAINT complaints_status_chk CHECK ("status" IN ('pending', 'answered', 'closed')),
  CONSTRAINT complaints_amount_chk CHECK ("amountClaimed" IS NULL OR "amountClaimed" >= 0),
  -- Si es menor de edad, el apoderado es obligatorio
  CONSTRAINT complaints_minor_chk  CHECK ("isMinor" = FALSE OR "guardianName" IS NOT NULL)
);

-- Bandeja del panel: primero lo pendiente y lo más antiguo arriba,
-- que es justo lo que está por vencer.
CREATE INDEX IF NOT EXISTS idx_complaints_status_due
  ON "Complaints" ("status", "dueAt" ASC);

CREATE INDEX IF NOT EXISTS idx_complaints_created
  ON "Complaints" ("createdAt" DESC);

-- El consumidor consulta el estado con código + documento.
CREATE INDEX IF NOT EXISTS idx_complaints_code_doc
  ON "Complaints" ("code", "documentNumber");
`;

module.exports = {
  up: async ({ sequelize, transaction }) => {
    await sequelize.query(sql, { transaction });
  },
};
