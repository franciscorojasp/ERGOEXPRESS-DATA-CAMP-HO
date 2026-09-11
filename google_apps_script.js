/**
 * ==============================================================================
 * ERGOEXPRESS C.A. - Backend Google Apps Script para Auditorías de Campo LOPCYMAT
 * ==============================================================================
 * Permite sincronización bidireccional multiusuario simultánea en tiempo real.
 * 
 * INSTRUCCIONES DE INSTALACIÓN:
 * 1. Cree o abra una hoja de cálculo en Google Sheets (ej: "ERGOEXPRESS_AUDITORIAS_2026").
 * 2. Vaya al menú: Extensiones -> Apps Script.
 * 3. Pegue este código reemplazando todo lo existente.
 * 4. Haga clic en "Implementar" -> "Nueva implementación".
 * 5. Tipo: "Aplicación web".
 *    - Ejecutar como: "Yo" (tu cuenta).
 *    - Quién tiene acceso: "Cualquier persona" (Anyone).
 * 6. Copie la URL proporcionada (termina en /exec) y péguela en la PWA en "Configurar Google Sheets".
 * ==============================================================================
 */

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var lock = LockService.getScriptLock();
  try {
    // Espera hasta 10 segundos para evitar colisiones de múltiples usuarios simultáneos
    lock.waitLock(10000);
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      return jsonResponse({ status: "error", message: "No active spreadsheet linked" });
    }

    // Inicializar hojas estructuradas si no existen
    initSheets(ss);

    var action = (e.parameter && e.parameter.action) || "read";
    var payload = null;
    
    if (e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
        if (payload.action) action = payload.action;
      } catch (err) {
        // Fallback en caso de parámetros simples
      }
    }

    if (action === "read" || action === "pull") {
      var auditId = (e.parameter && e.parameter.auditId) || (payload && payload.auditId) || "DEFAULT_AUDIT";
      var data = readAuditData(ss, auditId);
      return jsonResponse({ status: "success", action: "read", data: data, serverTime: new Date().toISOString() });
    }

    if (action === "save" || action === "sync" || action === "push") {
      if (!payload || !payload.data) {
        return jsonResponse({ status: "error", message: "No data payload provided" });
      }
      var user = payload.user || (e.parameter && e.parameter.user) || "Auditor";
      var auditId = payload.auditId || "DEFAULT_AUDIT";
      saveAuditData(ss, auditId, payload.data, user);
      
      // Registrar log de concurrencia
      logActivity(ss, auditId, user, "Guardado/Sincronización multiusuario");
      
      return jsonResponse({ 
        status: "success", 
        action: "save", 
        message: "Datos sincronizados correctamente en Google Sheets",
        auditId: auditId,
        serverTime: new Date().toISOString() 
      });
    }

    if (action === "ping") {
      return jsonResponse({ status: "success", message: "Conexión activa con ERGOEXPRESS Backend", serverTime: new Date().toISOString() });
    }

    return jsonResponse({ status: "error", message: "Acción no reconocida: " + action });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function initSheets(ss) {
  var sheetsNeeded = [
    { name: "Empresa", headers: ["ID_Auditoria", "Razon_Social", "RIF", "Lugar_Fecha", "Puesto_Trabajo", "Puesto_Num", "Actividad_Evaluada", "Jornada_Turnos", "Ultima_Actualizacion", "Usuario"] },
    { name: "Colaboradores", headers: ["ID_Auditoria", "Num_Trabajador", "Nombre_Apellido", "Cedula", "Genero", "Fecha_Nacimiento", "Fecha_Ingreso", "Cargo", "Mano_Dominante", "Peso_Kg", "Talla_m", "FC_Reposo", "FC_Actividad", "Patologia", "Diversidad_Funcional", "Estado_Civil", "Grado_Instruccion", "Ultima_Actualizacion", "Usuario"] },
    { name: "Encuesta_43", headers: ["ID_Auditoria", "Num_Pregunta", "Modulo", "Texto_Pregunta", "Respuesta_T1", "Respuesta_T2", "Respuesta_T3", "Respuesta_T4", "Respuesta_T5", "Respuesta_T6", "Observacion_Causa", "Ultima_Actualizacion", "Usuario"] },
    { name: "Mediciones_Higienicas", headers: ["ID_Auditoria", "Tipo_Medicion", "Punto_Muestreo", "Parametro_1", "Parametro_2", "Parametro_3", "Parametro_4", "Indice_Calculado", "Criterio_Norma", "Estado_Conformidad", "Detalle_Frecuencias", "Ultima_Actualizacion", "Usuario"] },
    { name: "Acta_Firmas", headers: ["ID_Auditoria", "Num_Firmante", "Nombre_Apellido", "Cedula", "Rol_Representacion", "Estado_Firma", "Hash_Huella", "Timestamp", "Inspector_Responsable", "Registro_INPSASEL", "Estado_Bloqueo", "Usuario"] },
    { name: "Log_Sincronizacion", headers: ["Timestamp", "ID_Auditoria", "Usuario", "Accion", "IP_Cliente"] }
  ];

  sheetsNeeded.forEach(function(item) {
    var sheet = ss.getSheetByName(item.name);
    if (!sheet) {
      sheet = ss.insertSheet(item.name);
      sheet.appendRow(item.headers);
      sheet.getRange(1, 1, 1, item.headers.length).setFontWeight("bold").setBackground("#174E4F").setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
  });
}

function saveAuditData(ss, auditId, data, user) {
  var now = new Date().toISOString();

  // 1. Guardar o actualizar datos de Empresa
  if (data.empresa) {
    var sheetEmp = ss.getSheetByName("Empresa");
    var rowData = [
      auditId,
      data.empresa.razonSocial || "",
      data.empresa.rif || "",
      data.empresa.lugarFecha || "",
      data.empresa.puestoTrabajo || "",
      data.empresa.puestoNum || "",
      data.empresa.actividad || "",
      data.empresa.jornada || "",
      now,
      user
    ];
    updateOrAppendRow(sheetEmp, auditId, rowData, 1);
  }

  // 2. Guardar datos de Colaboradores (hasta 6)
  if (data.colaboradores && Array.isArray(data.colaboradores)) {
    var sheetCol = ss.getSheetByName("Colaboradores");
    data.colaboradores.forEach(function(col, idx) {
      var compositeKey = auditId + "_T" + (idx + 1);
      var rowCol = [
        auditId,
        "Trabajador " + (idx + 1),
        col.nombre || "",
        col.cedula || "",
        col.genero || "",
        col.fechaNac || "",
        col.fechaIngreso || "",
        col.cargo || "",
        col.manoDominante || "",
        col.peso || "",
        col.talla || "",
        col.fcReposo || "",
        col.fcActividad || "",
        col.patologia || "",
        col.diversidad || "",
        col.estadoCivil || "",
        col.instruccion || "",
        now,
        user
      ];
      updateOrAppendComposite(sheetCol, auditId, "Trabajador " + (idx + 1), rowCol, 1, 2);
    });
  }

  // 3. Guardar Respuestas Encuesta
  if (data.encuesta) {
    var sheetEnc = ss.getSheetByName("Encuesta_43");
    // Almacenar el snapshot JSON completo de la encuesta para acceso rápido y auditoría
    var rowEnc = [
      auditId,
      "ENCUESTA_COMPLETA_JSON",
      "Microclima_1_43",
      JSON.stringify(data.encuesta),
      data.encuesta.t1_count || "",
      data.encuesta.t2_count || "",
      data.encuesta.t3_count || "",
      data.encuesta.t4_count || "",
      data.encuesta.t5_count || "",
      data.encuesta.t6_count || "",
      data.encuesta.causaP4 || "",
      now,
      user
    ];
    updateOrAppendComposite(sheetEnc, auditId, "ENCUESTA_COMPLETA_JSON", rowEnc, 1, 2);
  }

  // 4. Guardar Mediciones
  if (data.mediciones) {
    var sheetMed = ss.getSheetByName("Mediciones_Higienicas");
    var rowMed = [
      auditId,
      "MEDICIONES_HIGIENICAS_CONSOLIDADO",
      "Multi_Muestreo",
      data.mediciones.tgbh || "29.6",
      data.mediciones.luxL1 || "480",
      data.mediciones.ruidoLeq || "87.9",
      data.mediciones.dosisAcum || "142.5",
      JSON.stringify(data.mediciones),
      "COVENIN 2254 / 2249 / 1565",
      data.mediciones.estadoGlobal || "Atención Requerida",
      data.mediciones.octavas ? JSON.stringify(data.mediciones.octavas) : "",
      now,
      user
    ];
    updateOrAppendComposite(sheetMed, auditId, "MEDICIONES_HIGIENICAS_CONSOLIDADO", rowMed, 1, 2);
  }

  // 5. Guardar Firmas
  if (data.firmas) {
    var sheetFir = ss.getSheetByName("Acta_Firmas");
    var rowFir = [
      auditId,
      data.firmas.totalFirmas || "3",
      data.firmas.ultimoFirmante || "",
      data.firmas.cedulaFirmante || "",
      data.firmas.rolFirmante || "",
      data.firmas.firmado ? "REGISTRADO" : "PENDIENTE",
      data.firmas.hashHuella || "V-OK",
      now,
      data.firmas.inspector || "Ing. M. Villalobos",
      data.firmas.inpsasel || "MIR-0912440182",
      data.firmas.bloqueado ? "BLOQUEADO" : "EDITABLE",
      user
    ];
    updateOrAppendComposite(sheetFir, auditId, "ACTA_CONSOLIDADA", rowFir, 1, 2);
  }
}

function updateOrAppendRow(sheet, keyVal, newRowData, keyColIndex) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var keys = sheet.getRange(2, keyColIndex, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (keys[i][0] == keyVal) {
        sheet.getRange(i + 2, 1, 1, newRowData.length).setValues([newRowData]);
        return;
      }
    }
  }
  sheet.appendRow(newRowData);
}

function updateOrAppendComposite(sheet, key1, key2, newRowData, col1, col2) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var vals = sheet.getRange(2, 1, lastRow - 1, Math.max(col1, col2)).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (vals[i][col1 - 1] == key1 && vals[i][col2 - 1] == key2) {
        sheet.getRange(i + 2, 1, 1, newRowData.length).setValues([newRowData]);
        return;
      }
    }
  }
  sheet.appendRow(newRowData);
}

function readAuditData(ss, auditId) {
  var res = {
    empresa: {},
    colaboradores: [],
    encuesta: {},
    mediciones: {},
    firmas: {}
  };

  // Leer Empresa
  var sheetEmp = ss.getSheetByName("Empresa");
  if (sheetEmp && sheetEmp.getLastRow() > 1) {
    var rows = sheetEmp.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] == auditId) {
        res.empresa = {
          razonSocial: rows[i][1],
          rif: rows[i][2],
          lugarFecha: rows[i][3],
          puestoTrabajo: rows[i][4],
          puestoNum: rows[i][5],
          actividad: rows[i][6],
          jornada: rows[i][7],
          updatedAt: rows[i][8],
          updatedBy: rows[i][9]
        };
        break;
      }
    }
  }

  // Leer Colaboradores
  var sheetCol = ss.getSheetByName("Colaboradores");
  if (sheetCol && sheetCol.getLastRow() > 1) {
    var rowsCol = sheetCol.getDataRange().getValues();
    for (var j = 1; j < rowsCol.length; j++) {
      if (rowsCol[j][0] == auditId) {
        res.colaboradores.push({
          numTrabajador: rowsCol[j][1],
          nombre: rowsCol[j][2],
          cedula: rowsCol[j][3],
          genero: rowsCol[j][4],
          fechaNac: rowsCol[j][5],
          fechaIngreso: rowsCol[j][6],
          cargo: rowsCol[j][7],
          manoDominante: rowsCol[j][8],
          peso: rowsCol[j][9],
          talla: rowsCol[j][10],
          fcReposo: rowsCol[j][11],
          fcActividad: rowsCol[j][12],
          patologia: rowsCol[j][13],
          diversidad: rowsCol[j][14],
          estadoCivil: rowsCol[j][15],
          instruccion: rowsCol[j][16]
        });
      }
    }
  }

  // Leer Encuesta Snapshot
  var sheetEnc = ss.getSheetByName("Encuesta_43");
  if (sheetEnc && sheetEnc.getLastRow() > 1) {
    var rowsEnc = sheetEnc.getDataRange().getValues();
    for (var k = 1; k < rowsEnc.length; k++) {
      if (rowsEnc[k][0] == auditId && rowsEnc[k][1] == "ENCUESTA_COMPLETA_JSON") {
        try {
          res.encuesta = JSON.parse(rowsEnc[k][3]);
        } catch(e) {}
        break;
      }
    }
  }

  // Leer Mediciones
  var sheetMed = ss.getSheetByName("Mediciones_Higienicas");
  if (sheetMed && sheetMed.getLastRow() > 1) {
    var rowsMed = sheetMed.getDataRange().getValues();
    for (var m = 1; m < rowsMed.length; m++) {
      if (rowsMed[m][0] == auditId && rowsMed[m][1] == "MEDICIONES_HIGIENICAS_CONSOLIDADO") {
        try {
          res.mediciones = JSON.parse(rowsMed[m][7]);
        } catch(e) {
          res.mediciones = { tgbh: rowsMed[m][3], lux: rowsMed[m][4], leq: rowsMed[m][5] };
        }
        break;
      }
    }
  }

  // Leer Firmas
  var sheetFir = ss.getSheetByName("Acta_Firmas");
  if (sheetFir && sheetFir.getLastRow() > 1) {
    var rowsFir = sheetFir.getDataRange().getValues();
    for (var n = 1; n < rowsFir.length; n++) {
      if (rowsFir[n][0] == auditId) {
        res.firmas = {
          totalFirmas: rowsFir[n][1],
          ultimoFirmante: rowsFir[n][2],
          cedulaFirmante: rowsFir[n][3],
          rolFirmante: rowsFir[n][4],
          firmado: rowsFir[n][5] == "REGISTRADO",
          inspector: rowsFir[n][8],
          inpsasel: rowsFir[n][9],
          bloqueado: rowsFir[n][10] == "BLOQUEADO"
        };
        break;
      }
    }
  }

  return res;
}

function logActivity(ss, auditId, user, action) {
  var sheetLog = ss.getSheetByName("Log_Sincronizacion");
  if (sheetLog) {
    sheetLog.appendRow([new Date().toISOString(), auditId, user, action]);
  }
}
