import {
  ActionPostResponse,
  createPostResponse,
  ActionGetResponse,
  ActionPostRequest,
  createActionHeaders,
  ActionError,
  LinkedAction,
} from "@solana/actions";
import { PublicKey, Transaction } from "@solana/web3.js";
import logger from "@/common/logger";
import { BN, web3 } from "@coral-xyz/anchor";
import {
  CLUSTER_TYPES,
  I______________ById,
  IGetTxObject,
  ONCHAIN_PARTICIPATE_TYPE,
} from "@/common/types";
import { getRequestParam } from "@/common/helper/getParams";
import { ONCHAIN_CONFIG } from "@/common/helper/cluster.helper";
import { get______________ById } from "@/common/utils/api.util";
import { jsonResponse, Promisify } from "@/common/helper/responseMaker";
import { StatusCodes } from "http-status-codes";
import { GenericError } from "@/common/helper/error";
import { getTxObject, initWeb3, parseToPrecision, tokenAccounts } from "@/common/helper/helper";
import { checkBalanceAndGenerateOnrampLink } from "@/common/helper/insufficient-balance.helper";

// create the standard headers for this route (including CORS)
const headers = createActionHeaders();

export const GET = async (req: Request) => {
  try {
    logger.info("GET request received");
    /////////////////////////////////////
    /////////Extract Params//////////////
    /////////////////////////////////////
    const requestUrl = new URL(req.url);
    const ______________ID = getRequestParam<number>(requestUrl, "______________ID", false);
    const clusterurl = getRequestParam<CLUSTER_TYPES>(
      requestUrl,
      "clusterurl",
      false,
      Object.values(CLUSTER_TYPES),
      CLUSTER_TYPES.DEVNET,
    );

    const basicUrl =
      process.env.IS_PROD === "prod" ? "https://join.catoff.xyz" : new URL(req.url).origin; // TODO: edit text here

    logger.info("Fetching ______________ by ID: %s", ______________ID);

    const ______________ = await Promisify<I______________ById>(
      get______________ById(clusterurl, ______________ID),
    );

    const actions: LinkedAction[] = [
      {
        type: "transaction",
        label: `Join ______________ ${______________.Name}`,
        href: `/api/actions/join-______________?clusterurl=${clusterurl}&{______________ID}=${______________ID}`, // TODO: edit text here
      },
    ];

    const iconUrl = ______________.Media ?? new URL("/join.png", basicUrl).toString(); // TODO: edit media here

    const payload: ActionGetResponse = {
      title: "Join ______________", // TODO: edit text here
      icon: iconUrl,
      type: "action",
      description: `${______________.Name}
      
---

### Need funds in your wallet?
To add money to your wallet using **UPI**, copy your wallet address and click the link below:
➡️ [Add Funds Here](https://game.catoff.xyz/onramp)
`, // TODO: edit text here
      label: "Join",
      links: {
        actions: actions,
      },
    };

    logger.info("Payload constructed successfully for ______________ID: %s", ______________ID);
    return jsonResponse(payload, StatusCodes.OK, headers);
  } catch (err) {
    logger.error("An error occurred in GET handler: %s", err);
    const errorMessage = err instanceof GenericError ? err.message : "An unknown error occurred";
    const actionError: ActionError = { message: errorMessage };

    return jsonResponse(actionError, StatusCodes.BAD_REQUEST, headers);
  }
};

// DO NOT FORGET TO INCLUDE THE `OPTIONS` HTTP METHOD
// THIS WILL ENSURE CORS WORKS FOR BLINKS
export const OPTIONS = async () => Response.json(null, { headers });

export const POST = async (req: Request) => {
  try {
    /////////////////////////////////////
    /////////Extract Params//////////////
    /////////////////////////////////////
    const requestUrl = new URL(req.url);
    const clusterurl = getRequestParam<CLUSTER_TYPES>(
      requestUrl,
      "clusterurl",
      false,
      Object.values(CLUSTER_TYPES),
      CLUSTER_TYPES.DEVNET,
    );
    let ______________ID = getRequestParam<number>(requestUrl, "______________Id", false);

    /////////////////////////////////////
    /////////Extract Account/////////////
    /////////////////////////////////////
    const body: ActionPostRequest = await req.json();
    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      throw 'Invalid "account" provided';
    }

    /////////////////////////////////////
    ///////////Parse Phase///////////////
    /////////////////////////////////////

    const ______________ = await Promisify<I______________ById>(
      get______________ById(clusterurl, ______________ID),
    );

    /////////////////////////////////////
    /////////Transaction Phase///////////
    /////////////////////////////////////

    const { program, connection } = await initWeb3(clusterurl);
    await checkBalanceAndGenerateOnrampLink(connection, account, ______________.Wager);

    const { escrowTokenAccount, userTokenAccount } = await tokenAccounts({
      connection,
      currency: ______________.Currency,
      escrowPublicKey: ONCHAIN_CONFIG[clusterurl].escrowAccountPublicKey,
      userPublicKey: account,
      cluster: clusterurl,
    });

    const web3Join: IGetTxObject = {
      onchainParticipateType: ONCHAIN_PARTICIPATE_TYPE.JOIN_CHALLENGE,
      account,
      program,
      playerId: new BN(0),
      challengeId: new BN(______________ID),
      amount: new BN(
        parseToPrecision(
          ______________.Wager,
          ONCHAIN_CONFIG[clusterurl]?.Decimals[______________.Currency],
        ),
      ),
      currency: ______________.Currency,
      userPublicKey: account,
      userTokenAccount,
      escrowTokenAccount,
      cluster: clusterurl,
    };

    const transaction = await Promisify<Transaction>(getTxObject(web3Join));
    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        type: "transaction",
        transaction,
        message: "Challenge successfully joined!",
      },
    });
    return jsonResponse(payload, StatusCodes.OK, headers);
  } catch (err) {
    logger.error(err);
    let actionError: ActionError = { message: "An unknown error occurred" };
    if (typeof err == "string") actionError.message = err;
    return jsonResponse(actionError, StatusCodes.BAD_REQUEST, headers);
  }
};
