use cucumber::World;

mod steps;

use steps::MindzooWorld;

#[tokio::main]
async fn main() {
    MindzooWorld::cucumber()
        .run_and_exit("../features")
        .await;
}
