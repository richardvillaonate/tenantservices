const express = require('express');
const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;
const app = express();
const bodyParser = require('body-parser');

app.use(bodyParser.json());

// Ruta para crear un tenant
app.post('/createTenant', (req, res) => {
  const tenantName = req.body.tenantName;
  const tenantPath = path.join('/root/whatsapp-tenant-api', tenantName);

  // Verificar si el tenant ya existe
  if (fs.existsSync(tenantPath)) {
    return res.status(400).json({ message: `El tenant ${tenantName} ya existe.` });
  }

  // Crear el directorio para el tenant
  fs.mkdirSync(tenantPath, { recursive: true });

  // Clonar el repositorio en el directorio del tenant
  exec(`git clone https://github.com/richardvillaonate/nodejs-api-whatsapp.git ${tenantPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error al clonar el repositorio: ${error.message}`);
      return res.status(500).json({ message: `Error al clonar el repositorio para el tenant ${tenantName}.` });
    }

    console.log(stdout);
    console.log(stderr);

    // Instalar las dependencias usando pnpm
    exec(`cd ${tenantPath} && pnpm install`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error al instalar las dependencias: ${error.message}`);
        return res.status(500).json({ message: `Error al instalar las dependencias para el tenant ${tenantName}.` });
      }

      console.log(stdout);
      console.log(stderr);

      return res.json({ message: `Tenant ${tenantName} creado y dependencias instaladas.` });
    });
  });
});

// Ruta para crear el servicio de systemd para el tenant
app.post('/createService', (req, res) => {
  const tenantName = req.body.tenantName;
  const tenantPath = path.join('/root/whatsapp-tenant-api', tenantName);

  if (!fs.existsSync(tenantPath)) {
    return res.status(400).json({ message: `El tenant ${tenantName} no existe.` });
  }

  const serviceContent = `
[Unit]
Description=Tenant ${tenantName} API
After=network.target

[Service]
ExecStart=/usr/bin/node ${tenantPath}/server.js
WorkingDirectory=${tenantPath}
Restart=always
User=root
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
  `;

  const serviceFilePath = `/etc/systemd/system/tenant-${tenantName}.service`;

  // Escribir el archivo de servicio systemd
  fs.writeFileSync(serviceFilePath, serviceContent);

  // Recargar systemd y habilitar el servicio
  exec('sudo systemctl daemon-reload', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error al recargar systemd: ${error.message}`);
      return res.status(500).json({ message: 'Error al recargar systemd.' });
    }

    exec(`sudo systemctl enable tenant-${tenantName}.service && sudo systemctl start tenant-${tenantName}.service`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error al habilitar el servicio: ${error.message}`);
        return res.status(500).json({ message: 'Error al habilitar el servicio.' });
      }

      console.log(stdout);
      console.log(stderr);

      return res.json({ message: `Servicio para el tenant ${tenantName} creado y en ejecución.` });
    });
  });
});

// Otras rutas para detener, reiniciar, eliminar servicios, etc...

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
