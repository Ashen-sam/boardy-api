import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export interface ProjectInviteEmailData {
  recipientEmail: string;
  projectName: string;
  projectDescription?: string;
  inviterName: string;
  projectId: string; // ✅ Changed from number to string for UUID support
}

export const sendProjectInviteEmail = async (data: ProjectInviteEmailData) => {
  const { recipientEmail, projectName, inviterName, projectId, projectDescription } = data;
  const projectLink = `${process.env.FRONTEND_URL}/projects/${projectId}`;

  const mailOptions = {
    from: `"${process.env.APP_NAME || 'Project Manager'}" <${process.env.EMAIL_USER}>`,
    to: recipientEmail,
    subject: `You've been invited to join "${projectName}"`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Project Invitation</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              background-color: #f6f8fa;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
              color: #24292f;
            }
            .wrapper {
              max-width: 640px;
              margin: 40px auto;
              padding: 0 16px;
            }
            .card {
              background: #ffffff;
              border: 1px solid #d0d7de;
              border-radius: 6px;
              padding: 24px;
            }
            .logo {
              text-align: center;
              margin-bottom: 16px;
            }
            .logo img {
              width: 32px;
              height: 32px;
            }
            h1 {
              font-size: 20px;
              font-weight: 600;
              margin: 0 0 16px 0;
              text-align: center;
            }
            p {
              font-size: 14px;
              line-height: 1.6;
              margin: 12px 0;
            }
            .highlight {
              background-color: #f6f8fa;
              border: 1px solid #d0d7de;
              border-radius: 6px;
              padding: 16px;
              margin-top: 16px;
            }
            .project-name {
              font-weight: 600;
              margin-bottom: 6px;
            }
            .meta {
              font-size: 13px;
              color: #57606a;
            }
            .actions {
              margin-top: 16px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              flex-wrap: wrap;
            }
            .button {
              background-color: #009bff;
              color: #ffffff !important;
              text-decoration: none;
              padding: 6px 16px;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 500;
              display: inline-block;
            }
            .link {
              font-size: 13px;
              color: #0969da;
              text-decoration: none;
            }
            .footer {
              text-align: center;
              font-size: 12px;
              color: #57606a;
              margin-top: 24px;
            }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="card">
              <div class="logo">
                <!-- Replace with your app logo -->
                <img src="https://res.cloudinary.com/dr5msb2ty/image/upload/v1766105165/logo_rxzeoz.png" alt="Logo" />
              </div>
              <h1>You've been invited to a project</h1>
              <p>Hi there,</p>
              <p>
                <strong>${inviterName}</strong> has invited you to collaborate on a project.
              </p>
              <div class="highlight">
                <div class="project-name">${projectName}</div>
                ${projectDescription ? `<div class="meta">${projectDescription}</div>` : ''}
                <div class="actions">
               
                  <a href="${projectLink}" class="button">
                    Join Project
                  </a>
                </div>
              </div>
              <p class="meta" style="margin-top: 16px;">
                If you'd like to continue, simply click the button above.
              </p>
            </div>
            <div class="footer">
              <p>If you didn't expect this invitation, you can safely ignore this email.</p>
              <p>This is an automated message from ${process.env.APP_NAME || 'Project Manager'}.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Hi there,
      
      ${inviterName} has invited you to join the project: ${projectName}
      ${projectDescription ? `\n${projectDescription}\n` : ''}
      
      View the project here: ${projectLink}
      
      If you didn't expect this invitation, you can safely ignore this email.
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent to:', recipientEmail, '| Message ID:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email to:', recipientEmail, error);
    throw error;
  }
};

// Send emails to multiple recipients
export const sendBatchProjectInvites = async (
  emails: string[],
  projectData: Omit<ProjectInviteEmailData, 'recipientEmail'>
) => {
  const results = await Promise.allSettled(
    emails.map(email =>
      sendProjectInviteEmail({
        ...projectData,
        recipientEmail: email,
      })
    )
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log(`📧 Email Summary: ${successful} sent, ${failed} failed`);

  return {
    successful,
    failed,
    results,
  };
};