"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var googleapis_1 = require("googleapis");
var db_1 = require("@workspace/db");
var schema_1 = require("@workspace/db/schema");
var drizzle_orm_1 = require("drizzle-orm");
var dotenv = require("dotenv");
dotenv.config();
var SHEET_ID = process.env.GOOGLE_SHEET_ID;
function syncEgresos() {
    return __awaiter(this, void 0, void 0, function () {
        var credentials, auth, sheetsClient, egresos, headers, rows, allData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
                        console.error("No GOOGLE_APPLICATION_CREDENTIALS_JSON defined");
                        return [2 /*return*/];
                    }
                    credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
                    auth = new googleapis_1.google.auth.GoogleAuth({
                        credentials: credentials,
                        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
                    });
                    sheetsClient = googleapis_1.google.sheets({ version: "v4", auth: auth });
                    console.log("Fetching Egresos from database...");
                    return [4 /*yield*/, db_1.db.select().from(schema_1.egresosTable).orderBy((0, drizzle_orm_1.desc)(schema_1.egresosTable.fecha))];
                case 1:
                    egresos = _a.sent();
                    headers = [
                        "ID", "Fecha", "Categoría", "Concepto", "Proveedor", "Monto",
                        "Método de Pago", "Comprobante", "Proyecto", "Observaciones"
                    ];
                    rows = egresos.map(function (e) { return [
                        e.id, e.fecha, e.categoria, e.concepto, e.proveedor || "",
                        Number(e.monto), e.metodo_pago || "", e.comprobante ? "SI" : "NO",
                        e.centro_costos || "", e.observaciones || ""
                    ]; });
                    allData = __spreadArray([headers], rows, true);
                    console.log("Clearing Egresos sheet...");
                    return [4 /*yield*/, sheetsClient.spreadsheets.values.clear({
                            spreadsheetId: SHEET_ID,
                            range: "Egresos!A:Z",
                        })];
                case 2:
                    _a.sent();
                    console.log("Writing Egresos sheet...");
                    return [4 /*yield*/, sheetsClient.spreadsheets.values.update({
                            spreadsheetId: SHEET_ID,
                            range: "Egresos!A1",
                            valueInputOption: "USER_ENTERED",
                            requestBody: {
                                values: allData,
                            },
                        })];
                case 3:
                    _a.sent();
                    console.log("Success! Egresos sheet has been rebuilt.");
                    return [2 /*return*/];
            }
        });
    });
}
syncEgresos().catch(console.error).then(function () { return process.exit(0); });
