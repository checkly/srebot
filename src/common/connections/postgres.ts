import Knex from "knex";
import knexConfig from "../../../knexfile";

const postgres = Knex(knexConfig);

export default postgres;
