const nodemailer = require('nodemailer');

module.exports = {
  send: async (config, message) => {
    if (!config.host || !config.port || !config.user || !config.pass || !config.to) {
      throw new Error('Email config missing');
    }
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: false,
      auth: { user: config.user, pass: config.pass }
    });
    await transporter.sendMail({
      from: config.user,
      to: config.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
  }
};
