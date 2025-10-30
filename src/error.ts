export class DatabaseError extends Error {
    constructor(message: string = "Unknown Error") {
        super(message);
        this.name = "nopedb";
    }
}