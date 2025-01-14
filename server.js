const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const app = express();
const port = 3000;

app.use(express.json());

// Ruta para crear un tenant y sus archivos
app.post('/createTenant', (req, res) => {
    const { tenantName } = req.body;

    if (!tenantName) {
        return res.status(400).send('Tenant name is required');
    }

    const tenantDir = path.join(__dirname, tenantName);

    // Verificar si ya existe la carpeta del tenant
    if (fs.existsSync(tenantDir)) {
        return res.status(400).send('Tenant already exists');
    }

    // Crear carpeta para el tenant
    fs.mkdirSync(tenantDir);

    // Clonar el repositorio dentro del directorio del tenant
    exec(`git clone https://github.com/richardvillaonate/nodejs-api-whatsapp.git ${tenantDir}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al clonar el repositorio: ${stderr}`);
            return res.status(500).send('Error al clonar el repositorio');
        }

        // Instalar dependencias dentro de la carpeta del tenant
        exec(`pnpm install`, { cwd: tenantDir }, (err, out, stdErr) => {
            if (err) {
                console.error(`Error al instalar dependencias: ${stdErr}`);
                return res.status(500).send('Error al instalar dependencias');
            }
            return res.status(201).send(`Tenant ${tenantName} creado y dependencias instaladas`);
        });
    });
});

// Ruta para crear un archivo de servicio de systemd para un tenant
app.post('/createService', (req, res) => {
    const { tenantName } = req.body;

    if (!tenantName) {
        return res.status(400).send('Tenant name is required');
    }

    const serviceFilePath = `/etc/systemd/system/${tenantName}.service`;

    // Verificar si ya existe el archivo de servicio
    if (fs.existsSync(serviceFilePath)) {
        return res.status(400).send('Service already exists');
    }

    // Crear el archivo de servicio para systemd
    const serviceContent = `
[Unit]
Description=Servicio para tenant ${tenantName}
After=network.target

[Service]
ExecStart=/usr/bin/pnpm run dev
WorkingDirectory=/root/whatsapp-tenant-api/${tenantName}
Restart=always
User=root

[Install]
WantedBy=multi-user.target
`;

    fs.writeFileSync(serviceFilePath, serviceContent);

    // Recargar systemd para que reconozca el nuevo servicio
    exec('sudo systemctl daemon-reload', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al recargar systemd: ${stderr}`);
            return res.status(500).send('Error al crear el servicio');
        }

        // Habilitar el servicio para que se inicie al arrancar
        exec(`sudo systemctl enable ${tenantName}.service`, (err, out, stdErr) => {
            if (err) {
                console.error(`Error al habilitar el servicio: ${stdErr}`);
                return res.status(500).send('Error al habilitar el servicio');
            }

            // Iniciar el servicio
            exec(`sudo systemctl start ${tenantName}.service`, (e, o, se) => {
                if (e) {
                    console.error(`Error al iniciar el servicio: ${se}`);
                    return res.status(500).send('Error al iniciar el servicio');
                }
                return res.status(201).send(`Servicio para el tenant ${tenantName} creado y en ejecución`);
            });
        });
    });
});

// Ruta para detener un servicio de un tenant
app.post('/stopService', (req, res) => {
    const { tenantName } = req.body;

    if (!tenantName) {
        return res.status(400).send('Tenant name is required');
    }

    exec(`sudo systemctl stop ${tenantName}.service`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al detener el servicio: ${stderr}`);
            return res.status(500).send('Error al detener el servicio');
        }
        return res.status(200).send(`Servicio ${tenantName} detenido correctamente`);
    });
});

// Ruta para reiniciar un servicio de un tenant
app.post('/restartService', (req, res) => {
    const { tenantName } = req.body;

    if (!tenantName) {
        return res.status(400).send('Tenant name is required');
    }

    exec(`sudo systemctl restart ${tenantName}.service`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al reiniciar el servicio: ${stderr}`);
            return res.status(500).send('Error al reiniciar el servicio');
        }
        return res.status(200).send(`Servicio ${tenantName} reiniciado correctamente`);
    });
});

// Ruta para eliminar un servicio de un tenant
app.post('/removeService', (req, res) => {
    const { tenantName } = req.body;

    if (!tenantName) {
        return res.status(400).send('Tenant name is required');
    }

    // Detener el servicio antes de eliminarlo
    exec(`sudo systemctl stop ${tenantName}.service && sudo systemctl disable ${tenantName}.service`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al detener y deshabilitar el servicio: ${stderr}`);
            return res.status(500).send('Error al detener y deshabilitar el servicio');
        }

        // Eliminar el archivo del servicio
        const serviceFilePath = `/etc/systemd/system/${tenantName}.service`;
        fs.unlink(serviceFilePath, (err) => {
            if (err) {
                console.error(`Error al eliminar el archivo del servicio: ${err}`);
                return res.status(500).send('Error al eliminar el archivo del servicio');
            }
            // Recargar systemd después de eliminar el servicio
            exec('sudo systemctl daemon-reload', (e, o, se) => {
                if (e) {
                    console.error(`Error al recargar systemd: ${se}`);
                    return res.status(500).send('Error al recargar systemd');
                }
                return res.status(200).send(`Servicio ${tenantName} eliminado correctamente`);
            });
        });
    });
});

app.listen(port, () => {
    console.log(`API escuchando en http://localhost:${port}`);
});
