
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Social {
    struct Post {
        address author;
        string content;
        uint256 timestamp;
    }

    Post[] private posts;

    event PostCreated(uint256 indexed id, address indexed author, string content, uint256 timestamp);

    function createPost(string calldata content) external {
        require(bytes(content).length > 0, "Empty content");
        posts.push(Post({
            author: msg.sender,
            content: content,
            timestamp: block.timestamp
        }));
        emit PostCreated(posts.length - 1, msg.sender, content, block.timestamp);
    }

    function getPost(uint256 id) external view returns (address author, string memory content, uint256 timestamp) {
        require(id < posts.length, "Invalid id");
        Post storage p = posts[id];
        return (p.author, p.content, p.timestamp);
    }

    function getPostsCount() external view returns (uint256) {
        return posts.length;
    }
}
