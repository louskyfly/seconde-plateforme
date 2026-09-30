const XLSX = require('xlsx');
const wb = XLSX.readFile('data/anniversaires/classe-_-seconde-09.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
console.log(JSON.stringify(data, null, 2));