import { Connection, PublicKey } from "@solana/web3.js";
import { GenericError } from "@/common/helper/error";
import { StatusCodes } from "http-status-codes";
import { LAMPORTS_PER_SOL } from "./transaction.helper";

export async function checkBalanceAndGenerateOnrampLink(
  connection: Connection,
  account: PublicKey,
  wager: number,
): Promise<void> {
  const balance = await connection.getBalance(account);
  const lamportsToSol = balance / LAMPORTS_PER_SOL;
  console.info(`User balance: ${lamportsToSol} SOL`);

  if (lamportsToSol < wager) {
    const onrampLink = `https://game.catoff.xyz/onramp?wallet=${account.toString()}`;
    throw new GenericError(
      `Insufficient balance. Your balance is ${lamportsToSol} SOL, but you need ${wager} SOL.
      Add funds here: 
      ${onrampLink}`,
      StatusCodes.BAD_REQUEST,
    );
  }
}
