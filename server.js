const express = require('express');
const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');

// Configurar middleware
app.use(bodyParser.json());
app.use(cors()); // Habilitar CORS para todas las solicitudes

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

    // Instalar las dependencias usando pnpm
    exec(`cd ${tenantPath} && pnpm install`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error al instalar las dependencias: ${error.message}`);
        return res.status(500).json({ message: `Error al instalar las dependencias para el tenant ${tenantName}.` });
      }

      console.log(stdout);
      console.log(stderr);

      // Ejecutar el comando pnpm run dev
      const devProcess = exec(`cd ${tenantPath} && pnpm run dev`);

      // Mostrar salida del proceso
      devProcess.stdout.on('data', (data) => {
        console.log(`DEV STDOUT: ${data}`);
      });

      devProcess.stderr.on('data', (data) => {
        console.error(`DEV STDERR: ${data}`);
      });

      // Cancelar el proceso después de 30 segundos
      setTimeout(() => {
        devProcess.kill();
        console.log(`Proceso dev para ${tenantName} detenido después de 30 segundos.`);
        return res.json({ message: `Tenant ${tenantName} creado, dependencias instaladas y dev ejecutado temporalmente.` });
      }, 30000);
    });
  });
});


// Ruta para crear el servicio de systemd para el tenant
app.post('/createService', (req, res) => {
  // console.log(req.body);
  const tenantName = req.body.tenantName;
  const tenantPath = path.join('/root/whatsapp-tenant-api', tenantName);

  if (!fs.existsSync(tenantPath)) {
    return res.status(400).json({ message: `El tenant ${tenantName} no existe.` });
  }

  const serviceContent = `
[Unit]
Description=Ejecutar pnpm run dev en ${tenantPath}
After=network.target

[Service]
ExecStart=/usr/bin/pnpm run dev
WorkingDirectory=${tenantPath}
Restart=always
User=root

[Install]
WantedBy=multi-user.target
  `;

  const serviceFilePath = `/etc/systemd/system/tenant-${tenantName}.service`;

  // Intentamos escribir el archivo de servicio
  fs.writeFile(serviceFilePath, serviceContent.trim(), 'utf8', (err) => {
    if (err) {
      console.error(`Error al escribir el archivo de servicio: ${err.message}`);
      return res.status(500).json({ message: `Error al escribir el archivo de servicio para el tenant ${tenantName}.` });
    }

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

        // Retornar el contenido del archivo de servicio para validación
        return res.json({
          message: `Servicio para el tenant ${tenantName} creado y en ejecución.`,
          serviceContent: serviceContent.trim() // Se devuelve el contenido del archivo de servicio para validación
        });
      });
    });
  });
});

// Ruta para iniciar un servicio (por tenant)
app.post('/startService', (req, res) => {
  // console.log(req.body);
  const tenantName = req.body.tenantName;

  if (!tenantName) {
    return res.status(400).json({ message: 'El parámetro tenantName es obligatorio.' });
  }

  const serviceName = `tenant-${tenantName}.service`;

  exec(`sudo systemctl start ${serviceName}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error al iniciar el servicio: ${error.message}`);
      return res.status(500).json({ message: `Error al iniciar el servicio ${tenantName}.` });
    }

    return res.json({ message: `Servicio ${tenantName} iniciado correctamente.` });
  });
});

// Ruta para iniciar un servicio por nombre
app.post('/startServiceByName', (req, res) => {

  // console.log(req.body);
  const serviceName = req.body.serviceName || req.body.tenantName && `tenant-${req.body.tenantName}.service`;

  if (!serviceName) {
    return res.status(400).json({ message: 'El parámetro serviceName o tenantName es obligatorio.' });
  }

  exec(`sudo systemctl start ${serviceName}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error al iniciar el servicio: ${error.message}`);
      return res.status(500).json({ message: `Error al iniciar el servicio ${serviceName}.` });
    }

    return res.json({ message: `Servicio ${serviceName} iniciado correctamente.` });
  });
});

// Ruta para obtener el estado de un servicio
app.get('/serviceStatus', (req, res) => {
  // console.log(req.body);
  const tenantName = req.body.tenantName;

  if (!tenantName) {
    return res.status(400).json({ message: 'El parámetro tenantName es obligatorio.' });
  }

  const serviceName = `tenant-${tenantName}.service`;

  exec(`sudo systemctl status ${serviceName}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error al obtener el estado del servicio: ${error.message}`);
      return res.status(500).json({ message: `Error al obtener el estado del servicio ${tenantName}.` });
    }

    return res.json({ message: `Estado del servicio ${tenantName}: ${stdout}` });
  });
});

// Ruta para detener un servicio
app.post('/stopService', (req, res) => {
  // console.log(req.body);
  const tenantName = req.body.tenantName;
  const serviceName = `tenant-${tenantName}.service`;

  exec(`sudo systemctl stop ${serviceName}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error al detener el servicio: ${error.message}`);
      return res.status(500).json({ message: `Error al detener el servicio ${tenantName}.` });
    }

    return res.json({ message: `Servicio ${tenantName} detenido correctamente.` });
  });
});

// Ruta para reiniciar un servicio
app.post('/restartService', (req, res) => {
  // console.log(req.body);
  const tenantName = req.body.tenantName;
  const serviceName = `tenant-${tenantName}.service`;

  exec(`sudo systemctl restart ${serviceName}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error al reiniciar el servicio: ${error.message}`);
      return res.status(500).json({ message: `Error al reiniciar el servicio ${tenantName}.` });
    }

    return res.json({ respuesta:true ,message: `Servicio ${tenantName} reiniciado correctamente.` });
  });
});

// Ruta para eliminar un servicio
app.post('/deleteService', (req, res) => {
  // console.log(req.body);
  const tenantName = req.body.tenantName;
  const serviceName = `tenant-${tenantName}.service`;
  const serviceFilePath = `/etc/systemd/system/${serviceName}`;

  // Detener el servicio si está en ejecución
  exec(`sudo systemctl stop ${serviceName}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error al detener el servicio: ${error.message}`);
      return res.status(500).json({ message: `Error al detener el servicio ${tenantName}.` });
    }

    // Deshabilitar el servicio
    exec(`sudo systemctl disable ${serviceName}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error al deshabilitar el servicio: ${error.message}`);
        return res.status(500).json({ message: `Error al deshabilitar el servicio ${tenantName}.` });
      }

      // Eliminar el archivo de servicio
      fs.unlinkSync(serviceFilePath);

      // Recargar systemd
      exec('sudo systemctl daemon-reload', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error al recargar systemd: ${error.message}`);
          return res.status(500).json({ message: 'Error al recargar systemd.' });
        }

        return res.json({ message: `Servicio ${tenantName} eliminado correctamente.` });
      });
    });
  });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
