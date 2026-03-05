import { Request, Response } from "express";
import { identifyContact } from "../services/contactService";

export async function identify(req: Request, res: Response): Promise<void> {
  try {
    const { email, phoneNumber } = req.body;

    // Validate that at least one field is provided and non-null
    const hasEmail = email !== undefined && email !== null && email !== "";
    const hasPhone =
      phoneNumber !== undefined && phoneNumber !== null && phoneNumber !== "";

    if (!hasEmail && !hasPhone) {
      res.status(400).json({
        error: "At least one of 'email' or 'phoneNumber' must be provided",
      });
      return;
    }

    // Normalize: convert phoneNumber to string if it's a number
    const normalizedPhone = hasPhone ? String(phoneNumber) : null;
    const normalizedEmail = hasEmail ? String(email) : null;

    const result = await identifyContact({
      email: normalizedEmail,
      phoneNumber: normalizedPhone,
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in /identify:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
