import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.1";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SupportTicket {
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Support both old format (name, email, message) and new format (userEmail, category, description, metadata)
    const isNewFormat = 'userEmail' in body;
    
    let name: string, email: string, category: string, subject: string, message: string, metadata: any;
    
    if (isNewFormat) {
      // New AI Companion format
      email = body.userEmail || 'unknown@email.com';
      name = email.split('@')[0];
      category = body.category || 'other';
      subject = body.subject || 'Support Request';
      message = body.description || 'No description provided';
      metadata = body.metadata || {};
    } else {
      // Old format with validation
      const supportTicketSchema = z.object({
        name: z.string().trim().min(2).max(100),
        email: z.string().trim().email().max(255).toLowerCase(),
        category: z.string().trim().min(1).max(50),
        subject: z.string().trim().min(5).max(200),
        message: z.string().trim().min(10).max(2000)
      });

      const validation = supportTicketSchema.safeParse(body);
      if (!validation.success) {
        return new Response(
          JSON.stringify({ error: 'Invalid input', details: validation.error.errors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      name = validation.data.name;
      email = validation.data.email;
      category = validation.data.category;
      subject = validation.data.subject;
      message = validation.data.message;
      metadata = null;
    }

    console.log("Processing support ticket from:", email, "Category:", category);

    // Send email to support address
    const { data, error } = await resend.emails.send({
      from: "AdTool AI Support <support@useadtool.ai>",
      to: ["bestofproducts4u@gmail.com"],
      replyTo: email,
      subject: `[${category.toUpperCase()}] ${subject}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #6366F1, #4F46E5); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
              .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }
              .field { margin-bottom: 20px; }
              .label { font-weight: bold; color: #6366F1; margin-bottom: 5px; }
              .value { background: white; padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb; }
              .message-box { background: white; padding: 20px; border-radius: 6px; border: 1px solid #e5e7eb; white-space: pre-wrap; }
              .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">New Support Ticket</h1>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">AdTool AI Customer Support</p>
              </div>
              <div class="content">
                <div class="field">
                  <div class="label">Category:</div>
                  <div class="value" style="background: #EFF6FF; color: #1E40AF; padding: 12px; border-radius: 6px; border: 1px solid #BFDBFE; font-weight: 600;">${category}</div>
                </div>

                <div class="field">
                  <div class="label">From:</div>
                  <div class="value">${name}</div>
                </div>
                
                <div class="field">
                  <div class="label">Email:</div>
                  <div class="value">${email}</div>
                </div>
                
                <div class="field">
                  <div class="label">Subject:</div>
                  <div class="value">${subject}</div>
                </div>
                
                <div class="field">
                  <div class="label">Message:</div>
                  <div class="message-box">${message}</div>
                </div>
                
                ${metadata ? `
                <div class="field">
                  <div class="label">Technical Details:</div>
                  <div class="message-box" style="font-family: monospace; font-size: 12px;">${JSON.stringify(metadata, null, 2)}</div>
                </div>
                ` : ''}
                
                <div class="footer">
                  <p>This ticket was submitted via AdTool AI Support Form</p>
                  <p>Reply directly to this email to respond to the customer</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      throw error;
    }

    console.log("Support ticket sent successfully:", data);

    // Send confirmation email to customer
    await resend.emails.send({
      from: "AdTool AI Support <support@useadtool.ai>",
      to: [email],
      replyTo: "bestofproducts4u@gmail.com",
      subject: "We received your support ticket",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #6366F1, #4F46E5); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
              .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
              .footer { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 8px 8px; text-align: center; color: #6b7280; font-size: 12px; }
              .ticket-info { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #6366F1; }
              .btn { display: inline-block; background: #6366F1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">Thank You!</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">We've received your support ticket</p>
              </div>
              <div class="content">
                <p>Hi ${name},</p>
                <p>Thank you for contacting AdTool AI support. We've received your ticket and will respond to your inquiry as soon as possible.</p>
                
                <div class="ticket-info">
                  <strong>Your Ticket Details:</strong><br/>
                  <strong>Category:</strong> ${category}<br/>
                  <strong>Subject:</strong> ${subject}<br/>
                  <strong>Submitted:</strong> ${new Date().toLocaleString()}
                </div>
                
                <p>Our support team typically responds within 24 hours during business days. For urgent matters, you can also reach us via WhatsApp.</p>
                
                <p>Best regards,<br/>
                <strong>The AdTool AI Team</strong></p>
              </div>
              <div class="footer">
                <p>This is an automated confirmation email.</p>
                <p>© 2025 AdTool AI. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Ticket submitted successfully" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in send-support-ticket function:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send support ticket" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
