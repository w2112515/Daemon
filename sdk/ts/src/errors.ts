/**
 * L402 Custom Errors
 * 
 * @trace Task-P1-03
 */

/**
 * Base error for L402 operations
 */
export class L402Error extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'L402Error';
        Object.setPrototypeOf(this, L402Error.prototype);
    }
}

/**
 * Invalid or missing L402 challenge in response
 */
export class L402InvalidChallengeError extends L402Error {
    constructor(message: string) {
        super(message);
        this.name = 'L402InvalidChallengeError';
        Object.setPrototypeOf(this, L402InvalidChallengeError.prototype);
    }
}

/**
 * Payment failed
 */
export class L402PaymentFailedError extends L402Error {
    public readonly amountMsats: number;

    constructor(message: string, amountMsats = 0) {
        super(message);
        this.name = 'L402PaymentFailedError';
        this.amountMsats = amountMsats;
        Object.setPrototypeOf(this, L402PaymentFailedError.prototype);
    }
}

/**
 * Payment timeout
 */
export class L402PaymentTimeoutError extends L402Error {
    constructor(message = 'Payment timeout') {
        super(message);
        this.name = 'L402PaymentTimeoutError';
        Object.setPrototypeOf(this, L402PaymentTimeoutError.prototype);
    }
}
