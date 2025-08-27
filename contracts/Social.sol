
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Social {
    struct Post {
        address author;
        string content;
        uint256 timestamp;
        uint256 likes;
    }

    Post[] private posts;

    event PostCreated(uint256 indexed id, address indexed author, string content, uint256 timestamp);
    event PostLiked(uint256 indexed id, address indexed liker, uint256 newLikes);

    function createPost(string memory content) external {
        posts.push(Post({
            author: msg.sender,
            content: content,
            timestamp: block.timestamp,
            likes: 0
        }));
        uint256 id = posts.length - 1;
        emit PostCreated(id, msg.sender, content, block.timestamp);
    }

    function likePost(uint256 id) external {
        require(id < posts.length, "Invalid post id");
        posts[id].likes += 1;
        emit PostLiked(id, msg.sender, posts[id].likes);
    }

    function getPost(uint256 id) external view returns (address author, string memory content, uint256 timestamp, uint256 likes) {
        require(id < posts.length, "Invalid post id");
        Post storage p = posts[id];
        return (p.author, p.content, p.timestamp, p.likes);
    }

    function getPostsCount() external view returns (uint256) {
        return posts.length;
    }

    function getAllPosts() external view returns (Post[] memory) {
        return posts;
    }
}
