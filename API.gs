// function doPost(e) {
//   try {
//     const data = JSON.parse(e.postData.contents);

//     const {
//       date,
//       month,
//       type,
//       heading,
//       description,
//       amount,
//       account
//     } = data;

//     const id = Utilities.getUuid();
//     const createdAt = new Date();
//     const ss = SpreadsheetApp.getActiveSpreadsheet();

//     let sheetName = account;

//     // If account is Cash → use IDBI sheet
//     if (account === "Cash") {
//       sheetName = "IDBI";
//     }

//     const sheet = ss.getSheetByName(sheetName);
//     if (!sheet) {
//       return jsonResponse("error", "Sheet not found");
//     }

//     const lastUsed = sheet.getLastRow();
//     const colA = sheet.getRange(1, 1, lastUsed).getValues();

//     let lastRow = 0;
//     for (let i = colA.length - 1; i >= 0; i--) {
//       if (colA[i][0] !== "") {
//         lastRow = i + 1;
//         break;
//       }
//     }

//     const newRow = lastRow + 1;

//         // Insert main data
//     sheet.getRange(newRow, 1, 1, 8).setValues([[
//       new Date(date),
//       month,
//       type,
//       heading,
//       description,
//       amount,
//       id,
//       createdAt
//     ]]);

//     // SPECIAL CASE: IDBI sheet (Cash + IDBI dual balance)
//     if (sheetName === "IDBI") {

//       // Copy IDBI balance formula (G)
//       sheet.getRange(lastRow, 7).copyTo(sheet.getRange(newRow, 7));

//       // Copy Purse balance formula (H)
//       sheet.getRange(lastRow, 8).copyTo(sheet.getRange(newRow, 8));

//       // Set Cash/IDBI selector (I)
//       sheet.getRange(newRow, 9).setValue(account);   
//     } else {

//       // NORMAL BANK SHEETS
//       // Copy only Balance formula (G)
//       sheet.getRange(lastRow, 7).copyTo(sheet.getRange(newRow, 7));

//       // Set Account column (H)
//       sheet.getRange(newRow, 8).setValue(account);
//     }

//     return jsonResponse("success", "Row inserted");

//   } catch (err) {
//     return jsonResponse("error", err.toString());
//   }
// }


function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    
    // Determine if it's the new structured payload or the old transaction array
    const type = payload.type || "transactions";
    const data = payload.data || payload; 
    const records = Array.isArray(data) ? data : [data];

    // --- TRANSACTIONS LOGIC ---
    // --- TRANSACTIONS LOGIC ---
    if (type === "transactions") {
      let errors = [];
      let inserted = 0;

      records.forEach(tx => {
        const { date, month, type, heading, description, amount, account } = tx;
        const id = tx.id || Utilities.getUuid();
        const createdAt = new Date();
        const ss = SpreadsheetApp.getActiveSpreadsheet();

        let sheetName = account;
        if (account === "Cash") {
          sheetName = "IDBI";
        } else if (account && account.startsWith("CC")) {
          sheetName = "CreditCard";
        }

        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) {
          errors.push(sheetName);
          return; 
        }

        const txDate = new Date(date);
        txDate.setHours(0, 0, 0, 0);

        const lastUsed = sheet.getLastRow();
        let insertRow = lastUsed + 1; // Default to appending at the bottom

        // 1. Find chronological insertion point
        if (lastUsed >= 2) {
          const dateValues = sheet.getRange(2, 1, lastUsed - 1, 1).getValues();
          for (let i = 0; i < dateValues.length; i++) {
            const cellVal = dateValues[i][0];
            if (!cellVal) continue;
            
            const cellDate = new Date(cellVal);
            cellDate.setHours(0, 0, 0, 0);
            
            if (cellDate > txDate) {
              insertRow = i + 2; 
              break;
            }
          }
        }

        // 2. Insert row if it belongs in the middle
        if (insertRow <= lastUsed) {
          sheet.insertRowBefore(insertRow);
        }

        // 3. Insert the main data
        sheet.getRange(insertRow, 1, 1, 8).setValues([[
          new Date(date), month, type, heading, description, amount, id, createdAt
        ]]);

        // 4. Handle Formulas and maintain the balance chain!
        const sourceRow = (insertRow > 2) ? insertRow - 1 : (lastUsed >= 2 ? insertRow + 1 : 0);

        if (sheetName === "IDBI") {
          if (sourceRow > 0) {
            sheet.getRange(sourceRow, 7, 1, 2).copyTo(sheet.getRange(insertRow, 7, 1, 2));
            // Repair the formula chain for the row that got pushed down
            if (insertRow <= lastUsed) {
              sheet.getRange(insertRow, 7, 1, 2).copyTo(sheet.getRange(insertRow + 1, 7, 1, 2));
            }
          }
          sheet.getRange(insertRow, 9).setValue(account);
        } else {
          if (sourceRow > 0) {
            sheet.getRange(sourceRow, 7).copyTo(sheet.getRange(insertRow, 7));
            // Repair the formula chain for the row that got pushed down
            if (insertRow <= lastUsed) {
              sheet.getRange(insertRow, 7).copyTo(sheet.getRange(insertRow + 1, 7));
            }
          }
          sheet.getRange(insertRow, 8).setValue(account);
        }

        inserted++;

        // 5. CRITICAL: Force the sheet to update immediately so the next loop cycle calculates rows properly
        SpreadsheetApp.flush();
      });

      if (errors.length > 0) {
        const uniqueErrors = [...new Set(errors)].join(", ");
        return ContentService.createTextOutput(JSON.stringify({
          status: "success", 
          message: `${inserted} inserted. Skipped missing sheets: ${uniqueErrors}`
        })).setMimeType(ContentService.MimeType.JSON);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success", 
        message: `${inserted} transactions inserted`
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // --- INVESTMENTS LOGIC ---
    else if (type === "investments") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName("INVES-T-RACKER");
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({status: "error", message: "Sheet INVES-T-RACKER not found"})).setMimeType(ContentService.MimeType.JSON);

      let inserted = 0;
      records.forEach(inv => {
        const snapshotDate = new Date(inv.date);
        const snapshotStr = Utilities.formatDate(snapshotDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
        
        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return;

        // Prevent duplicates
        const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        const exists = dates.some(d => {
          if (!d[0]) return false;
          const cellStr = (d[0] instanceof Date) ? Utilities.formatDate(d[0], Session.getScriptTimeZone(), "dd/MM/yyyy") : d[0].toString();
          return cellStr === snapshotStr || d[0] === inv.date;
        });
        
        if (exists) return; // Skip if already exists

        const prevRow = lastRow;
        const prevValues = sheet.getRange(prevRow, 2, 1, 4).getValues()[0]; // Copy B-E
        const prevFormulasR1C1 = sheet.getRange(prevRow, 8, 1, 6).getFormulasR1C1(); // Copy H-M formulas

        sheet.insertRowAfter(prevRow);
        const newRow = prevRow + 1;

        sheet.getRange(newRow, 1).setValue(snapshotDate).setNumberFormat("dd/MM/yyyy");
        sheet.getRange(newRow, 2, 1, 4).setValues([prevValues]);
        sheet.getRange(newRow, 6, 1, 2).setValues([[inv.total_inv, inv.total_curr]]); // Set F-G
        sheet.getRange(newRow, 8, 1, 6).setFormulasR1C1(prevFormulasR1C1); // Set H-M
        
        inserted++;
      });
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: `${inserted} investments synced`})).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {

    if (e.parameter.type === "transactions") {
      return getTransactions();
    }

    // Default → balances
    return getBalances();

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getBalances() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("OVERALL");

  const range = sheet.getRange("B4:C10").getValues();

  const result = {};

  range.forEach(row => {
    let name = row[0];
    let value = row[1];

    if (!name) return;

    name = name.replace(/[^\w\s]/g, "").trim();

    if (typeof value === "string") {
      value = Number(value.replace(/,/g, ""));
    }

    result[name] = value;
  });

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getTransactions() {

  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("COMPLETE");

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return ContentService
      .createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();

  let allTransactions = [];

  data.forEach((row, index) => {

  allTransactions.push({
    id: index + 2,
    date: Utilities.formatDate(
      row[0],
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    ),
    month: Utilities.formatDate(
      row[0],
      Session.getScriptTimeZone(),
      "yyyy-MM-01"
    ),
    type: row[2],
    heading: row[3],
    description: row[4],
    amount: row[5],
    account: row[6]
  });

});

  return ContentService
    .createTextOutput(JSON.stringify(allTransactions))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonResponse(status, message) {
  return ContentService
    .createTextOutput(JSON.stringify({ status, message }))
    .setMimeType(ContentService.MimeType.JSON);
}