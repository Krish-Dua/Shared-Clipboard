import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";

import { notFound } from "./middlewares/notFound.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";



dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;




app.use(cors());

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));

app.use(cookieParser());


app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Server is running ."
    });
});


app.use(notFound);

app.use(errorHandler);


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});