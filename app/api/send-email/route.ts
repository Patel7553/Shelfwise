import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export async function GET() {
  try {
    const { data: products, error } = await supabase
      .from("products")
      .select("*");

    if (error) {
      return NextResponse.json({
        success: false,
        message: error.message,
      });
    }

    const today = new Date();

    const expiringProducts = products.filter((p) => {
      if (!p.expiry_date) return false;

      const expiry = new Date(p.expiry_date);

      const daysLeft = Math.ceil(
        (expiry.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24)
      );

      return daysLeft >= 0 && daysLeft <= 7;
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    if (expiringProducts.length > 0) {
      const productList = expiringProducts
        .map(
          (p) =>
            `• ${p.name} — expires ${p.expiry_date}`
        )
        .join("\n");

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: "🚨 ShelfWise Expiry Alert",
        text: `
The following products are expiring soon:

${productList}

Total items: ${expiringProducts.length}
        `,
      });
    }

    return NextResponse.json({
      success: true,
      expiring: expiringProducts.length,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error.message,
    });
  }
}